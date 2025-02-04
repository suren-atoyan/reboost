import chalk from 'chalk';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

import { ReboostInstance } from '../index';
import { getPluginHooks } from './processor';
import { uniqueID } from '../utils';

export const resolveDependency = async (
  instance: ReboostInstance,
  pathToResolve: string,
  relativeTo: string
) => {
  for (const hook of getPluginHooks(instance).resolveHooks) {
    const resolvedPath = await hook(pathToResolve, relativeTo);
    if (resolvedPath) return resolvedPath;
  }

  instance.log('info', chalk.red(`Unable to resolve path "${pathToResolve}" of "${relativeTo}"`));
  return null;
}

const isPathRouted = (path: string) => path.startsWith('#/');
const pathFromRouted = (path: string) => path.substring(1);

export const resolveImports = async (
  instance: ReboostInstance,
  ast: t.Node,
  filePath: string
) => {
  let error = false;
  const imports: string[] = [];

  const resolveDeclaration = async (
    nodePath: NodePath<t.ImportDeclaration> | NodePath<t.ExportDeclaration>
  ): Promise<void> => {
    if (nodePath.has('source')) {
      const sourcePath = nodePath.get('source') as NodePath<t.StringLiteral>;
      const source = sourcePath.node.value;

      if (source === 'reboost/hmr' || source === 'reboost/hot') {
        // TODO: Remove it in v1.0
        if (source === 'reboost/hmr') {
          instance.log('info', chalk.yellow(`Warning ${filePath}: "reboost/hmr" is deprecated, please use "reboost/hot"`));
        }

        sourcePath.replaceWith(t.stringLiteral(`/hot?q=${encodeURIComponent(filePath)}`));
      } else {
        let finalPath = null;
        let routed = false;
        if (isPathRouted(source)) {
          finalPath = pathFromRouted(source);
          routed = true;
        } else {
          const resolvedPath = await resolveDependency(instance, source, filePath);
          if (resolvedPath) {
            if (isPathRouted(resolvedPath)) {
              finalPath = pathFromRouted(resolvedPath);
              routed = true;
            } else {
              finalPath = resolvedPath;
              imports.push(finalPath);
            }
          } else {
            error = true;
          }
        }

        sourcePath.replaceWith(t.stringLiteral(
          routed
            ? finalPath
            : finalPath
              ? `/transformed?q=${encodeURIComponent(finalPath)}`
              : `/unresolved?import=${encodeURIComponent(source)}&importer=${encodeURIComponent(filePath)}`
        ));
      }
    }
  }

  const promiseExecutors: (() => Promise<void>)[] = [];
  let astProgram: NodePath<t.Program>;
  let hasImportMeta = false;

  traverse(ast, {
    noScope: true,
    Program(nodePath) {
      astProgram = nodePath;
    },
    ImportDeclaration(nodePath) {
      promiseExecutors.push(() => resolveDeclaration(nodePath));
      return false;
    },
    ExportDeclaration(nodePath) {
      promiseExecutors.push(() => resolveDeclaration(nodePath));
      return false;
    },
    CallExpression(nodePath) {
      if (t.isIdentifier(nodePath.node.callee, { name: '__reboost_resolve' })) {
        promiseExecutors.push(async () => {
          const toResolve = (nodePath.node.arguments[0] as t.StringLiteral).value;
          if (isPathRouted(toResolve)) {
            nodePath.replaceWith(t.stringLiteral(pathFromRouted(toResolve)));
          } else {
            const resolvedPath = await resolveDependency(instance, toResolve, filePath);
            if (resolvedPath) {
              nodePath.replaceWith(t.stringLiteral(resolvedPath));
            }
          }
        });
      } else if (t.isImport(nodePath.node.callee)) {
        // Rewrite dynamic imports
        const importerIdentifier = t.identifier(`importer_${uniqueID(6)}`);
        const importerDeclaration = t.importDeclaration([
          t.importDefaultSpecifier(importerIdentifier)
        ], t.stringLiteral('/importer'));
        astProgram.node.body.unshift(importerDeclaration);
        
        nodePath.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.identifier(importerIdentifier.name),
              t.identifier('Dynamic')
            ),
            [
              nodePath.node.arguments[0],
              t.stringLiteral(filePath)
            ]
          )
        );
      }
    },
    MetaProperty(path) {
      if (
        t.isIdentifier(path.node.meta, { name: 'import' }) &&
        t.isIdentifier(path.node.property, { name: 'meta' })
      ) hasImportMeta = true;
    }
  });

  if (hasImportMeta) {
    const importMeta = t.metaProperty(
      t.identifier('import'),
      t.identifier('meta')
    );
    const importMetaUrl = t.memberExpression(
      importMeta,
      t.identifier('url')
    );
    const localHotIdentifier = t.identifier('Hot_' + uniqueID(4));

    astProgram.node.body.unshift(
      t.importDeclaration(
        [t.importSpecifier(localHotIdentifier, t.identifier('Hot'))],
        t.stringLiteral('/runtime')
      ),

      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(
            importMeta,
            t.identifier('reboost')
          ),
          t.booleanLiteral(true)
        )
      ),

      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(
            importMeta,
            t.identifier('absoluteUrl')
          ),
          importMetaUrl
        )
      ),

      t.expressionStatement(
        t.assignmentExpression(
          '=',
          importMetaUrl,
          t.stringLiteral(filePath)
        )
      ),

      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(
            importMeta,
            t.identifier('hot')
          ),
          t.newExpression(
            localHotIdentifier,
            [t.stringLiteral(filePath)]
          )
        )
      )
    );
  }

  for (const execute of promiseExecutors) await execute();

  if (imports.length) {
    astProgram.node.body.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.identifier('Reboost'), t.stringLiteral('[[Private]]'), true),
            t.identifier('setDependencies')
          ),
          [
            t.stringLiteral(filePath),
            t.arrayExpression(imports.map((s) => t.stringLiteral(s)))
          ]
        )
      )
    );
  }

  return error;
}
