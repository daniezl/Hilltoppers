import type { Plugin } from 'vite';

/**
 * Vite plugin to remove Firebase's remote script loading code
 * which violates Chrome Extension Manifest V3 policies
 */
export function removeFirebaseRemoteCode(): Plugin {
  return {
    name: 'remove-firebase-remote-code',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        
        if (chunk.type === 'chunk' && chunk.code) {
          // Replace Firebase's script loading configuration with empty functions
          chunk.code = chunk.code.replace(
            /\$n\s*\(\s*\{[\s\S]*?gapiScript\s*:\s*"https:\/\/apis\.google\.com\/js\/api\.js"[\s\S]*?\}\s*\)/g,
            '/* Firebase remote script loading removed for Manifest V3 compliance */'
          );
          
          // Remove any remaining references to external Google scripts
          chunk.code = chunk.code.replace(
            /"https:\/\/apis\.google\.com\/js\/api\.js"/g,
            '""'
          );
          chunk.code = chunk.code.replace(
            /"https:\/\/www\.google\.com\/recaptcha\/api\.js"/g,
            '""'
          );
          chunk.code = chunk.code.replace(
            /"https:\/\/www\.google\.com\/recaptcha\/enterprise\.js\?render="/g,
            '""'
          );
        }
      }
    }
  };
}

