/**
 * 返金イベント受信サービス
 */
import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';

import { createOrderReport } from '../report/order';

const USE_PAY_ORDER_ACTION = process.env.USE_PAY_ORDER_ACTION === '1';

export function onRefunded(params: alverca.factory.chevre.action.trade.refund.IAction) {
    return async (repos: {
        order: alverca.repository.Order;
        report: alverca.repository.Report;
    }): Promise<void> => {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case alverca.factory.chevre.actionType.ReturnAction:
                if (USE_PAY_ORDER_ACTION) {
                    await onOrderRefunded(params)(repos);
                }
                break;

            default:
        }
    };
}

function onOrderRefunded(params: alverca.factory.chevre.action.trade.refund.IAction) {
    return async (repos: {
        order: alverca.repository.Order;
        report: alverca.repository.Report;
    }): Promise<void> => {
        // 注文を取得して、売上レポートに連携
        const orderNumber = (<any>params).purpose?.object?.orderNumber;
        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.orderNumber not string');
        }

        const order = await repos.order.orderModel.findOne({ orderNumber })
            .exec()
            .then((doc) => {
                if (doc === null) {
                    throw new Error('Order not found');

                }

                return doc.toObject();
            });

        // 注文から売上レポート作成
        await createOrderReport({
            order: {
                ...order,
                orderStatus: cinerinoapi.factory.orderStatus.OrderReturned,
                dateReturned: moment(params.startDate)
                    .toDate()
            }
        })(repos);
    };
}
