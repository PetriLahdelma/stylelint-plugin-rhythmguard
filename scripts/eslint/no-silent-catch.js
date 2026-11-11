'use strict';

/**
 * A repository rule: a `catch` that drops the error (`catch {}`) must say why
 * in a comment inside it. A bare catch is how a malformed `.rhythmguardrc.json`
 * or a throwing Tailwind config became a silent fallback (cq-05); now each one
 * is either commented as an expected failure or binds the error and reports it.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a comment in every catch block that drops its error' },
    messages: {
      silent: 'This catch drops the error with no comment. Say why the failure is expected, or bind the error and report it as a warning.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    return {
      CatchClause(node) {
        if (node.param) {
          return;
        }
        if (sourceCode.getCommentsInside(node.body).length > 0) {
          return;
        }
        context.report({ messageId: 'silent', node });
      },
    };
  },
};
