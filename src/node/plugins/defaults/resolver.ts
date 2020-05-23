import fs from 'fs';
import path from 'path';

import { ReboostPlugin } from '../../index';
import { getConfig } from '../../shared';
import { isDir } from '../../utils';

const resolveExt = (fPath: string) => {
  for (const ext of getConfig().resolve.extensions) {
    if (fs.existsSync(fPath + ext)) return ext;
  }
  return null;
}

const baseResolve = (fPath: string) => {
  if (fs.existsSync(fPath) && isDir(fPath)) {
    for (const mainFile of getConfig().resolve.mainFiles) {
      const dirPath = path.join(fPath, mainFile);
      const ext = resolveExt(dirPath);
      if (ext) return dirPath + ext;
    }
  }

  const ext = resolveExt(fPath);
  if (ext) return fPath + ext;

  if (fs.existsSync(fPath) && !isDir(fPath)) return fPath;

  return null;
}

export const resolvePath = (basePath: string, pathToResolve: string) => {
  if (pathToResolve.startsWith('.')) {
    return baseResolve(path.resolve(path.dirname(basePath), pathToResolve));
  } else {
    const [firstPart, ...restPart] = pathToResolve.split('/').filter((s) => s !== '');
    const config = getConfig();

    if (firstPart in config.resolve.alias) {
      const aliasPath = config.resolve.alias[firstPart];
      return baseResolve(path.resolve(config.rootDir, aliasPath, ...restPart));
    } else {
      // Check in resolve.modules directories
      const { rootDir, resolve } = getConfig();

      for (const modulesDirName of resolve.modules) {
        const modulesDirPath = path.join(rootDir, modulesDirName);

        if (fs.existsSync(modulesDirPath)) {
          const moduleName = firstPart;
          let moduleDirPath = path.join(modulesDirPath, moduleName);

          if (moduleName.startsWith('@')) {
            // Using scoped package
            moduleDirPath = path.join(modulesDirPath, moduleName, restPart.shift());
          }

          if (restPart.length !== 0) {
            // Using subdirectories
            return baseResolve(path.join(moduleDirPath, ...restPart));
          } else {
            // Get from package.json
            const pkgJSONPath = path.join(moduleDirPath, 'package.json');
            if (fs.existsSync(pkgJSONPath)) {
              const pkgJSON = JSON.parse(fs.readFileSync(pkgJSONPath).toString());
              const scriptFilePath = pkgJSON.module || pkgJSON.main;
              if (scriptFilePath) return path.join(moduleDirPath, scriptFilePath);
            }

            const indexJSPath = path.join(moduleDirPath, 'index.js');
            if (fs.existsSync(indexJSPath)) return indexJSPath;
          }
        }
      }
    }
  }

  return null;
}

export const ResolverPlugin: ReboostPlugin = {
  name: 'core-resolver-plugin',
  resolve(importPath, importer) {
    if (importPath.startsWith('#/')) return importPath;
    return resolvePath(importer, importPath);
  }
}
