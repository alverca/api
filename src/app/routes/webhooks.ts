/**
 * ウェブフックルーター
 */
import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as express from 'express';
import * as mongoose from 'mongoose';

import { onActionStatusChanged } from '../controllers/webhook';

const webhooksRouter = express.Router();

import { NO_CONTENT } from 'http-status';

/**
 * 注文返金イベント
 * 購入者による手数料あり返品の場合に発生
 */
webhooksRouter.post(
    '/onReturnOrder',
    async (req, res, next) => {
        try {
            const order = <cinerinoapi.factory.order.IOrder | undefined>req.body.data;

            if (typeof order?.orderNumber === 'string') {
                const reportRepo = new alverca.repository.Report(mongoose.connection);

                await alverca.service.report.order.createRefundOrderReport({
                    order: order
                })({ report: reportRepo });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post(
    '/onOrderStatusChanged',
    async (req, res, next) => {
        try {
            const order = <cinerinoapi.factory.order.IOrder>req.body.data;

            const reportRepo = new alverca.repository.Report(mongoose.connection);

            if (typeof order?.orderNumber === 'string') {
                // 注文から売上レポート作成
                await alverca.service.report.order.createOrderReport({
                    order: order
                })({ report: reportRepo });

                switch (order.orderStatus) {
                    case cinerinoapi.factory.orderStatus.OrderReturned:
                        break;

                    default:
                }
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

            // とりあえずアクション保管
            if (typeof action?.id === 'string' && typeof action?.typeOf === 'string') {
                await actionRepo.actionModel.findByIdAndUpdate(
                    action.id,
                    { $setOnInsert: action },
                    { upsert: true }
                )
                    .exec();
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

export default webhooksRouter;
