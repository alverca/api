/**
 * 認証ミドルウェア
 */
import * as chevre from '@chevre/domain';

import { cognitoAuth } from '@motionpicture/express-middleware';
import { NextFunction, Request, Response } from 'express';

// 許可発行者リスト
const ISSUERS = (<string>process.env.TOKEN_ISSUERS).split(',');

// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        await cognitoAuth({
            issuers: ISSUERS,
            authorizedHandler: async (user, token) => {
                const identifier: chevre.factory.person.IIdentifier = [
                    {
                        name: 'tokenIssuer',
                        value: user.iss
                    },
                    {
                        name: 'clientId',
                        value: user.client_id
                    },
                    {
                        name: 'hostname',
                        value: req.hostname
                    }
                ];

                // リクエストユーザーの属性を識別子に追加
                try {
                    identifier.push(...Object.keys(user)
                        .filter((key) => key !== 'scope' && key !== 'scopes') // スコープ情報はデータ量がDBの制限にはまる可能性がある
                        .map((key) => {
                            return {
                                name: String(key),
                                value: String((<any>user)[key])
                            };
                        }));
                } catch (error) {
                    // no op
                }

                let programMembership: chevre.factory.programMembership.IProgramMembership | undefined;
                if (user.username !== undefined) {
                    programMembership = {
                        membershipNumber: user.username,
                        project: { typeOf: chevre.factory.organizationType.Project, id: <string>req.project?.id },
                        typeOf: chevre.factory.programMembership.ProgramMembershipType.ProgramMembership,
                        url: user.iss
                    };
                }

                req.user = user;
                req.accessToken = token;
                req.agent = {
                    typeOf: chevre.factory.personType.Person,
                    id: user.sub,
                    memberOf: programMembership,
                    identifier: identifier
                };

                next();
            },
            unauthorizedHandler: (err) => {
                next(new chevre.factory.errors.Unauthorized(err.message));
            }
        })(req, res, next);
    } catch (error) {
        next(new chevre.factory.errors.Unauthorized(error.message));
    }
};
