export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer @effect/platform APIs over native Node.js/Bun/Deno platform APIs',
      recommended: true,
    },
    messages: {
      preferPlatformHttp:
        'Use @effect/platform HttpClient instead of native fetch() or http/https modules. Import from "@effect/platform".',
      preferPlatformFileSystem:
        'Use @effect/platform FileSystem instead of node:fs, Bun.file(), or Deno.readFile(). Import FileSystem from "@effect/platform".',
      preferPlatformPath:
        'Use @effect/platform Path instead of node:path. Import Path from "@effect/platform".',
      preferPlatformCommand:
        'Use @effect/platform Command instead of node:child_process, Bun.spawn(), or Deno.Command(). Import Command from "@effect/platform".',
      preferPlatformTerminal:
        'Use @effect/platform Terminal instead of process.stdout/stderr or console methods. Import Terminal from "@effect/platform".',
      preferPlatformProcess:
        'Use @effect/platform Runtime instead of direct process access. Import from "@effect/platform-node" or equivalent.',
    },
    schema: [],
  },

  create(context) {
    return {
      NewExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Deno' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'Command'
        ) {
          context.report({
            node,
            messageId: 'preferPlatformCommand',
          });
        }
      },

      ImportDeclaration(node) {
        const source = node.source.value;

        const platformImports = {
          'node:fs': 'preferPlatformFileSystem',
          fs: 'preferPlatformFileSystem',
          'node:fs/promises': 'preferPlatformFileSystem',
          'fs/promises': 'preferPlatformFileSystem',
          'node:path': 'preferPlatformPath',
          path: 'preferPlatformPath',
          'node:http': 'preferPlatformHttp',
          http: 'preferPlatformHttp',
          'node:https': 'preferPlatformHttp',
          https: 'preferPlatformHttp',
          'node:child_process': 'preferPlatformCommand',
          child_process: 'preferPlatformCommand',
        };

        if (platformImports[source]) {
          context.report({
            node,
            messageId: platformImports[source],
          });
        }
      },

      CallExpression(node) {
        const { callee } = node;

        if (callee.type === 'Identifier' && callee.name === 'fetch') {
          context.report({
            node,
            messageId: 'preferPlatformHttp',
          });
        }

        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Bun'
        ) {
          const property = callee.property?.name;

          if (property === 'file' || property === 'write') {
            context.report({
              node,
              messageId: 'preferPlatformFileSystem',
            });
          }

          if (property === 'spawn' || property === 'spawnSync') {
            context.report({
              node,
              messageId: 'preferPlatformCommand',
            });
          }
        }

        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Deno'
        ) {
          const property = callee.property?.name;

          const fileOperations = [
            'readFile',
            'readTextFile',
            'writeFile',
            'writeTextFile',
            'readDir',
            'mkdir',
            'remove',
            'rename',
            'copyFile',
            'stat',
            'lstat',
            'realPath',
            'readLink',
            'symlink',
            'link',
            'chmod',
            'chown',
          ];

          if (fileOperations.includes(property)) {
            context.report({
              node,
              messageId: 'preferPlatformFileSystem',
            });
          }

          if (property === 'Command') {
            context.report({
              node,
              messageId: 'preferPlatformCommand',
            });
          }
        }

        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'console'
        ) {
          const property = callee.property?.name;
          const allowedConsoleMethods = ['log', 'error', 'warn', 'info', 'debug'];

          if (allowedConsoleMethods.includes(property)) {
            context.report({
              node,
              messageId: 'preferPlatformTerminal',
            });
          }
        }
      },

      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'process' &&
          node.property.type === 'Identifier'
        ) {
          const property = node.property.name;

          const streamProperties = ['stdout', 'stderr', 'stdin'];
          if (streamProperties.includes(property)) {
            context.report({
              node,
              messageId: 'preferPlatformTerminal',
            });
          }

          const processProperties = ['env', 'cwd', 'exit', 'argv'];
          if (processProperties.includes(property)) {
            context.report({
              node,
              messageId: 'preferPlatformProcess',
            });
          }
        }
      },
    };
  },
};
