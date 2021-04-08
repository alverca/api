import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';

import { onPaid } from './webhook/onPaid';
import { onRefunded } from './webhook/onRefunded';

export type IOrder4report = cinerinoapi.factory.order.IOrder & {
    numItems: number;
};

export interface IAccountingReport {
    typeOf: 'Report';
    hasPart: any[];
    mainEntity: IOrder4report;
}

export function onOrderStatusChanged(params: cinerinoapi.factory.order.IOrder) {
    return async (repos: {
        accountingReport: alverca.repository.AccountingReport;
        order: alverca.repository.Order;
    }) => {
        const order4report: IOrder4report = createOrder4report(params);

        // 注文を保管
        await repos.order.orderModel.findOneAndUpdate(
            { orderNumber: params.orderNumber },
            { $setOnInsert: order4report },
            { upsert: true }
        )
            .exec();

        const accountingReport: IAccountingReport = createAccountingReport(order4report);

        // 経理レポートを保管
        await repos.accountingReport.accountingReportModel.findOneAndUpdate(
            { 'mainEntity.orderNumber': params.orderNumber },
            { $setOnInsert: accountingReport },
            { upsert: true }
        )
            .exec();
    };
}

function createOrder4report(params: cinerinoapi.factory.order.IOrder): IOrder4report {
    const numItems: number = (Array.isArray(params.acceptedOffers)) ? params.acceptedOffers.length : 0;

    // 必要な属性についてDate型に変換(でないと検索クエリを効率的に使えない)
    const acceptedOffers = (Array.isArray(params.acceptedOffers))
        ? params.acceptedOffers.map((o) => {
            if (o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
                let itemOffered = <cinerinoapi.factory.order.IReservation>o.itemOffered;
                const reservationFor = itemOffered.reservationFor;
                itemOffered = {
                    ...itemOffered,
                    reservationFor: {
                        ...reservationFor,
                        ...(typeof reservationFor.doorTime !== undefined)
                            ? {
                                doorTime: moment(reservationFor.doorTime)
                                    .toDate()
                            }
                            : undefined,
                        ...(typeof reservationFor.endDate !== undefined)
                            ? {
                                endDate: moment(reservationFor.endDate)
                                    .toDate()
                            }
                            : undefined,
                        ...(typeof reservationFor.startDate !== undefined)
                            ? {
                                startDate: moment(reservationFor.startDate)
                                    .toDate()
                            }
                            : undefined

                    }
                };

                return {
                    ...o,
                    itemOffered
                };
            } else {
                return o;
            }
        })
        : [];

    return {
        ...params,
        acceptedOffers,
        numItems
    };
}

function createAccountingReport(params: IOrder4report): IAccountingReport {
    return {
        typeOf: 'Report',
        hasPart: [],
        mainEntity: params
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
        accountingReport: alverca.repository.AccountingReport;
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
