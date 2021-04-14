"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScopesPermitted = void 0;
/**
 * スコープ許可ミドルウェア
 */
const chevre = require("@chevre/domain");
const createDebug = require("debug");
const debug = createDebug('@chevre/api:middlewares:permitScopes');
exports.default = (permittedScopes) => {
    return (req, __, next) => {
        if (process.env.RESOURECE_SERVER_IDENTIFIER === undefined) {
            next(new Error('RESOURECE_SERVER_IDENTIFIER undefined'));
            return;
        }
        debug('req.user.scopes:', req.user.scopes);
        // ドメインつきのスコープリストも許容するように変更
        const permittedScopesWithResourceServerIdentifier = [
            ...permittedScopes.map((permittedScope) => `${process.env.RESOURECE_SERVER_IDENTIFIER}/${permittedScope}`),
            ...permittedScopes.map((permittedScope) => `${process.env.RESOURECE_SERVER_IDENTIFIER}/auth/${permittedScope}`),
            ...['aws.cognito.signin.user.admin'] // 管理者ログインスコープは無条件に許容
        ];
        debug('permittedScopesWithResourceServerIdentifier:', permittedScopesWithResourceServerIdentifier);
        // スコープチェック
        try {
            debug('checking scope requirements...', permittedScopesWithResourceServerIdentifier);
            if (!isScopesPermitted(req.user.scopes, permittedScopesWithResourceServerIdentifier)) {
                next(new chevre.factory.errors.Forbidden('scope requirements not satisfied'));
            }
            else {
                next();
            }
        }
        catch (error) {
            next(error);
        }
    };
};
/**
 * 所有スコープが許可されたスコープかどうか
 *
 * @param {string[]} ownedScopes 所有スコープリスト
 * @param {string[]} permittedScopes 許可スコープリスト
 */
function isScopesPermitted(ownedScopes, permittedScopes) {
    debug('checking scope requirements...', permittedScopes);
    if (!Array.isArray(ownedScopes)) {
        throw new Error('ownedScopes should be array of string');
    }
    const permittedOwnedScope = permittedScopes.find((permittedScope) => ownedScopes.indexOf(permittedScope) >= 0);
    return (permittedOwnedScope !== undefined);
}
exports.isScopesPermitted = isScopesPermitted;
