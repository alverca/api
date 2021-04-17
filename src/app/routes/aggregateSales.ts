/**
 * 売上レポートルーター
 */
import * as chevre from '@chevre/domain';

import { Router } from 'express';
import { query } from 'express-validator';
import * as mongoose from 'mongoose';

import permitScopes from '../middlewares/permitScopes';
import validator from '../middlewares/validator';

const aggregateSalesRouter = Router();

/**
 * 検索
 */
aggregateSalesRouter.get(
    '',
    permitScopes(['admin']),
    ...[
        query('limit')
            .optional()
            .isInt()
            .toInt(),
        query('page')
            .optional()
            .isInt()
            .toInt(),
        query('$and.*[\'reservation.reservationFor.startDate\'].$exists')
            .optional()
            .isBoolean()
            .toBoolean(),
        query('$and.*[\'reservation.reservationFor.startDate\'].$gte')
            .optional()
            .isISO8601()
            .toDate(),
        query('$and.*[\'reservation.reservationFor.startDate\'].$lt')
            .optional()
            .isISO8601()
            .toDate(),
        query('$and.*.dateRecorded.$gte')
            .optional()
            .isISO8601()
            .toDate(),
        query('$and.*.dateRecorded.$lt')
            .optional()
            .isISO8601()
            .toDate(),
        query('$and.*.orderDate.$gte')
            .optional()
            .isISO8601()
            .toDate(),
        query('$and.*.orderDate.$lt')
            .optional()
            .isISO8601()
            .toDate()
    ],
    validator,
    async (req, res, next) => {
        try {
            // tslint:disable-next-line:no-magic-numbers
            const limit = (typeof req.query?.limit === 'number') ? Math.min(req.query.limit, 100) : 100;
            const page = (typeof req.query?.page === 'number') ? Math.max(req.query.page, 1) : 1;

            const reportRepo = new chevre.repository.Report(mongoose.connection);
            const andConditions: any[] = [
                { 'project.id': { $exists: true, $eq: req.project?.id } }
            ];
            const $and = req.query?.$and;
            if (Array.isArray($and)) {
                andConditions.push(...$and);
            }
            const reports = await reportRepo.aggregateSaleModel.find(
                (Array.isArray(andConditions) && andConditions.length > 0) ? { $and: andConditions } : {}
            )
                .sort({ sortBy: 1 })
                .limit(limit)
                .skip(limit * (page - 1))
                .setOptions({ maxTimeMS: 10000 })
                .exec()
                .then((docs) => docs.map((doc) => doc.toObject()));

            res.json(reports);
        } catch (error) {
            next(error);
        }
    }
);

export default aggregateSalesRouter;
