/**
 * OAuthミドルウェア
 * @see https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/
 */
import * as ttts from '@tokyotower/domain';

import { cognitoAuth } from '@motionpicture/express-middleware';
import { NextFunction, Request, Response } from 'express';

// 許可発行者リスト
const ISSUERS = (<string>process.env.TOKEN_ISSUERS).split(',');

// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        req.project = { typeOf: 'Project', id: <string>process.env.PROJECT_ID };

        await cognitoAuth({
            issuers: ISSUERS,
            authorizedHandler: async (user, token) => {
                const identifier: ttts.factory.person.IIdentifier = [
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
                        .filter((key) => key !== 'scopes') // scopeとデータ内容は重複するので省く
                        .map((key) => {
                            return {
                                name: String(key),
                                value: String((<any>user)[key])
                            };
                        }));
                } catch (error) {
                    // no op
                }

                let programMembership: ttts.factory.cinerino.programMembership.IProgramMembership | undefined;
                if (user.username !== undefined) {
                    programMembership = {
                        typeOf: <ttts.factory.cinerino.programMembership.ProgramMembershipType>'ProgramMembership',
                        membershipNumber: user.username,
                        programName: 'Amazon Cognito',
                        award: [],
                        url: user.iss
                    };
                }

                req.user = user;
                req.accessToken = token;
                req.agent = {
                    typeOf: ttts.factory.personType.Person,
                    id: user.sub,
                    memberOf: programMembership,
                    identifier: identifier
                };

                next();
            },
            unauthorizedHandler: (err) => {
                next(new ttts.factory.errors.Unauthorized(err.message));
            }
        })(req, res, next);
    } catch (error) {
        next(new ttts.factory.errors.Unauthorized(error.message));
    }
};
