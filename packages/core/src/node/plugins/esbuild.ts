import * as esbuild from 'esbuild';

import path from 'path';

import { ReboostPlugin } from '../index';
import { merge } from '../utils';

export interface esbuildPluginOptions {
  /** Loaders to use for file types */
  loaders?: Record<string, esbuild.Loader>;
  /** Options for JSX */
  jsx?: {
    /**
     * Factory function to use for creating elements
     * @default React.createElement
     */
    factory?: string;
    /**
     * Component to use as the fragment component
     * @default React.Fragment
     */
    fragment?: string;
  }
  /** ECMAScript version to target */
  target?: 'esnext' | 'es6' | 'es2015' | 'es2016' | 'es2017' | 'es2018' | 'es2019' | 'es2020';
  /**
   * Minify code
   * @default true
   */
  minify?: boolean;
  /**
   * Only minifies syntax
   * @default true
   */
  minifySyntax?: boolean;
  /**
   * Define values of variables
   * @default { 'process.env.NODE_ENV': '"development"' }
   */
  define?: Record<string, string>;
  /** Pre-started service to use with esbuild */
  service?: Promise<esbuild.Service>;
}

export const PluginName = 'core-esbuild-plugin';
export const esbuildPlugin = (options: esbuildPluginOptions = {}): ReboostPlugin => {
  const defaultOptions: Required<esbuildPluginOptions> = {
    loaders: {
      js: 'ts',
      jsx: 'tsx',
      mjs: 'ts',
      cjs: 'ts',
      es6: 'ts',
      es: 'ts',
      ts: 'ts',
      tsx: 'tsx'
    },
    jsx: {
      factory: 'React.createElement',
      fragment: 'React.Fragment'
    },
    target: 'es2020',
    minify: true,
    minifySyntax: true,
    define: undefined,
    service: undefined,
  };
  let compatibleTypes: string[];
  let esbuildServicePromise: Promise<esbuild.Service>;

  return {
    name: PluginName,
    setup({ config, chalk }) {
      if (options.service) esbuildServicePromise = options.service;
      if (!esbuildServicePromise) esbuildServicePromise = esbuild.startService();

      defaultOptions.minify = !config.debugMode;
      defaultOptions.minifySyntax = !config.debugMode;
      options = merge(defaultOptions, options);
      compatibleTypes = Object.keys(options.loaders);

      // TODO: Remove in v1.0
      const aOpts = options as esbuildPluginOptions & { jsxFactory: string; jsxFragment: string; };
      const showWarning = (oldOpt: string, newOpt: string) => {
        if (!config.log) return;
        let message = `esbuildPlugin: options.${oldOpt} is deprecated and will be removed in next major release. `;
        message += `Use options.${newOpt} instead.`;
        console.log(chalk.yellow(message));
      }
      if (aOpts.jsxFactory) {
        showWarning('jsxFactory', 'jsx.factory');
        aOpts.jsx.factory = aOpts.jsxFactory;
      }
      if (aOpts.jsxFragment) {
        showWarning('jsxFragment', 'jsx.fragment');
        aOpts.jsx.fragment = aOpts.jsxFragment;
      }
    },
    async stop() {
      if (!options.service) (await esbuildServicePromise).stop();
    },
    async transformContent(data, filePath) {
      if (compatibleTypes.includes(data.type)) {
        try {
          const { js, jsSourceMap, warnings } = await (await esbuildServicePromise).transform(data.code, {
            sourcemap: 'external',
            sourcefile: path.relative(this.config.rootDir, filePath),
            loader: options.loaders[data.type],
            jsxFactory: options.jsx.factory,
            jsxFragment: options.jsx.fragment,
            target: options.target,
            minify: options.minify,
            minifySyntax: options.minifySyntax,
            define: options.define
          });

          if (this.config.log) {
            warnings.forEach(({ location: { line, column, lineText, file }, text }) => {
              const lText = text.toLowerCase();
              if (lText.includes('unsupported source map')) return;

              let msg = `esbuild: Warning "${file}"\n\n`;
              msg += `(${line}:${column}) ${text}\n`;
              msg += `| ${lineText}`;
              
              console.log(this.chalk.yellow(msg));
            });
          }

          return {
            code: js,
            map: JSON.parse(jsSourceMap),
            type: 'js'
          }
        } catch (e) {
          const error = e.errors[0] as esbuild.Message;
          let msg = `esbuildPlugin: Error when processing "${error.location.file}"\n`;
          msg += `${error.text} on line ${error.location.line} at column ${error.location.column}\n\n`;
          msg += `| ${error.location.lineText}`;

          return new Error(msg);
        }
      }

      return null;
    }
  }
}
