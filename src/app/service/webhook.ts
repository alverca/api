import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';

import { onPaid } from './webhook/onPaid';
import { onRefunded } from './webhook/onRefunded';

export function onOrderStatusChanged(params: cinerinoapi.factory.order.IOrder) {
    return async (repos: {
        order: alverca.repository.Order;
    }) => {
        // 注文を保管
        await repos.order.orderModel.findOneAndUpdate(
            { orderNumber: params.orderNumber },
            { $setOnInsert: params },
            { upsert: true }
        )
            .exec();
    };
}

/**
 * 予約使用アクション変更イベント処理
 */
export function onActionStatusChanged(
    params: alverca.factory.chevre.action.IAction<alverca.factory.chevre.action.IAttributes<alverca.factory.chevre.actionType, any, any>>
) {
    return async (repos: {
        report: alverca.repository.Report;
    }) => {
        const action = params;

        if (action.typeOf === alverca.factory.chevre.actionType.UseAction) {
            const actionObject = action.object;
            if (Array.isArray(actionObject)) {
                const reservations =
                    <alverca.factory.chevre.reservation.IReservation<alverca.factory.chevre.reservationType.EventReservation>[]>
                    actionObject;

                const attended = action.actionStatus === alverca.factory.chevre.actionStatusType.CompletedActionStatus;
                const dateUsed = moment(action.startDate)
                    .toDate();

                await Promise.all(reservations.map(async (reservation) => {
                    if (reservation.typeOf === alverca.factory.chevre.reservationType.EventReservation
                        && typeof reservation.id === 'string'
                        && reservation.id.length > 0) {
                        await useReservationAction2report({
                            reservation,
                            attended,
                            dateUsed
                        })(repos);
                    }
                }));
            }
        }
    };
}

/**
 * 予約をレポートに反映する
 */
function useReservationAction2report(params: {
    reservation: alverca.factory.chevre.reservation.IReservation<alverca.factory.chevre.reservationType.EventReservation>;
    attended: boolean;
    dateUsed: Date;
}) {
    return async (repos: {
        report: alverca.repository.Report;
    }) => {
        const reservation = params.reservation;

        const reportDoc = await repos.report.aggregateSaleModel.findOne({
            'reservation.id': {
                $exists: true,
                $eq: reservation.id
            }
        })
            .exec();

        if (reportDoc !== null) {
            const report = <alverca.factory.report.order.IReport>reportDoc.toObject();
            const oldDateUsed = report.reservation.reservedTicket?.dateUsed;

            if (params.attended) {
                if (oldDateUsed !== undefined) {
                    // すでにdateUsedがあれば何もしない
                } else {
                    await repos.report.aggregateSaleModel.updateMany(
                        {
                            'reservation.id': {
                                $exists: true,
                                $eq: reservation.id
                            }
                        },
                        {
                            'reservation.reservedTicket.dateUsed': params.dateUsed
                        }
                    )
                        .exec();
                }
            } else {
                // すでにdateUsedがあれば、比較して同一であればunset
                if (oldDateUsed !== undefined) {
                    if (moment(params.dateUsed)
                        .isSame(moment(oldDateUsed))) {
                        await repos.report.aggregateSaleModel.updateMany(
                            {
                                'reservation.id': {
                                    $exists: true,
                                    $eq: reservation.id
                                }
                            },
                            {
                                $unset: {
                                    'reservation.reservedTicket.dateUsed': 1
                                }
                            }
                        )
                            .exec();
                    }
                } else {
                    // 同一でなければ何もしない
                }
            }
        }
    };
}

/**
 * 決済ステータス変更イベント
 */
export function onPaymentStatusChanged(
    params: alverca.factory.chevre.action.IAction<alverca.factory.chevre.action.IAttributes<alverca.factory.chevre.actionType, any, any>>
) {
    return async (repos: {
        order: alverca.repository.Order;
        report: alverca.repository.Report;
    }): Promise<void> => {
        switch (params.typeOf) {
            case alverca.factory.chevre.actionType.PayAction:
                await onPaid(<alverca.factory.chevre.action.trade.pay.IAction>params)(repos);
                break;

            case alverca.factory.chevre.actionType.RefundAction:
                await onRefunded(<alverca.factory.chevre.action.trade.refund.IAction>params)(repos);
                break;

            default:
            // no op
        }
    };
}
