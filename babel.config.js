module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // zod v4 ships ESM that uses `export * as ns`, which the RN preset skips.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
  overrides: [
    {
      // Hermes mis-binds large destructured parameter lists captured by
      // closures in react-navigation (ReferenceError at render). Compile the
      // destructuring away for that package only.
      test: /node_modules[\/]@react-navigation[\/]/,
      plugins: [
        '@babel/plugin-transform-parameters',
        '@babel/plugin-transform-destructuring',
      ],
    },
  ],
};
