module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Colours live in src/theme/tokens.ts only.
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
        message: 'No raw hex colours: use src/theme/tokens.ts.',
      },
    ],
  },
  overrides: [
    {
      // Bit operations are the job here: base64 packing and constant-time comparison.
      files: ['src/domain/base64*.ts', 'src/domain/crypto*.ts'],
      rules: { 'no-bitwise': 'off' },
    },
    {
      files: ['src/theme/tokens.ts'],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      // Domain layer is pure TypeScript: no React Native imports.
      files: ['src/domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: ['react', 'react-native', 'react-native-*'] },
        ],
      },
    },
  ],
};
