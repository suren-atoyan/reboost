const {
  start,
  builtInPlugins: {
    esbuildPlugin
  }
} = require('reboost');

start({
  entries: [
    ['./src/index.js', './public/dist/index.js']
  ],
  contentServer: {
    root: './public',
    open: true
  }
});
