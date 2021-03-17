/**
 * ウェブフックルーター
 */
import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as express from 'express';
import * as mongoose from 'mongoose';

import { onActionStatusChanged, onOrderStatusChanged, onPaymentStatusChanged } from '../service/webhook';

const webhooksRouter = express.Router();

import { NO_CONTENT } from 'http-status';

/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post(
    '/onOrderStatusChanged',
    async (req, res, next) => {
        try {
            const order = <cinerinoapi.factory.order.IOrder>req.body.data;

            const orderRepo = new alverca.repository.Order(mongoose.connection);

            if (typeof order?.orderNumber === 'string') {
                await onOrderStatusChanged(order)({ order: orderRepo });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

/**
 * 予約使用アクション変更イベント
 */
webhooksRouter.post(
    '/onActionStatusChanged',
    async (req, res, next) => {
        try {
            const action
                // tslint:disable-next-line:max-line-length
                = <alverca.factory.chevre.action.IAction<alverca.factory.chevre.action.IAttributes<alverca.factory.chevre.actionType, any, any>> | undefined>
                req.body.data;

            const reportRepo = new alverca.repository.Report(mongoose.connection);

            if (typeof action?.typeOf === 'string') {
                await onActionStatusChanged(action)({ report: reportRepo });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

/**
 * 決済アクション受信
 */
webhooksRouter.post(
    '/onPaymentStatusChanged',
    async (req, res, next) => {
        try {
            const action
                // tslint:disable-next-line:max-line-length
                = <alverca.factory.chevre.action.IAction<alverca.factory.chevre.action.IAttributes<alverca.factory.chevre.actionType, any, any>> | undefined>
                req.body.data;

            const actionRepo = new alverca.repository.Action(mongoose.connection);
            const orderRepo = new alverca.repository.Order(mongoose.connection);
            const reportRepo = new alverca.repository.Report(mongoose.connection);

            if (typeof action?.id === 'string' && typeof action?.typeOf === 'string') {
                // とりあえずアクション保管
                await actionRepo.actionModel.findByIdAndUpdate(
                    action.id,
                    { $setOnInsert: action },
                    { upsert: true }
                )
                    .exec();

                await onPaymentStatusChanged(action)({
                    order: orderRepo,
                    report: reportRepo
                });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

export default webhooksRouter;
