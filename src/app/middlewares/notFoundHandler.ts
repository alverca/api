/**
 * 404ハンドラーミドルウェア
 */
import * as alverca from '@alverca/domain';
import { NextFunction, Request, Response } from 'express';

export default (req: Request, __: Response, next: NextFunction) => {
    next(new alverca.factory.errors.NotFound(`router for [${req.originalUrl}]`));
};
