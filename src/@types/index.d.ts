/**
 * アプリケーション固有の型
 */
import { factory } from '@chevre/domain';

declare global {
    namespace Express {
        export interface IUser {
            sub: string;
            token_use: string;
            scope: string;
            scopes: string[];
            iss: string;
            exp: number;
            iat: number;
            version: number;
            jti: string;
            client_id: string;
            username?: string;
        }

        // tslint:disable-next-line:interface-name
        export interface Request {
            project?: factory.project.IProject;
            agent: factory.person.IPerson;
            user: IUser;
            accessToken: string;
        }
    }
}
