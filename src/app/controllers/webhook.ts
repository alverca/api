import * as alverca from '@alverca/domain';
import * as moment from 'moment-timezone';

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
