/**
 * パフォーマンスコントローラー
 * @namespace controllers/performance
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(<string>process.env.REDIS_PORT, 10),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

const debug = createDebug('ttts-api:controller:performance');

export interface ISearchConditions {
    limit?: number;
    page?: number;
    // 上映日
    day?: string;
    // 部門
    section?: string;
    // フリーワード
    words?: string;
    // この時間以降開始のパフォーマンスに絞る(timestamp milliseconds)
    startFrom?: number;
    // 劇場
    theater?: string;
    // スクリーン
    screen?: string;
    // パフォーマンスID
    performanceId?: string;
    // 車椅子チェック要求
    wheelchair?: string;
}

export interface IMultilingualString {
    en: string;
    ja: string;
    kr: string;
}

export interface IPerformance {
    id: string;
    attributes: {
        day: string;
        open_time: string;
        start_time: string;
        end_time: string;
        seat_status: string;
        // theater_name: IMultilingualString;
        // screen_name: IMultilingualString;
        // film: string;
        // film_name: IMultilingualString;
        // film_sections: string[];
        // film_minutes: number;
        // film_copyright: string;
        // film_image: string;
        tour_number: string;
        wheelchair_available: number;
        online_sales_status: ttts.factory.performance.OnlineSalesStatus;
        ev_service_status: ttts.factory.performance.EvServiceStatus;
        ticket_types: ITicketTypeWithAvailability[]
    };
}

export type ITicketTypeWithAvailability = ttts.factory.performance.ITicketType & {
    available_num: number
};

export interface ISearchResult {
    performances: IPerformance[];
    numberOfPerformances: number;
    filmIds: string[];
    // salesSuspended: any[];
}

/**
 * 検索する
 *
 * @param {ISearchConditions} searchConditions 検索条件
 * @return {ISearchResult} 検索結果
 * @memberof controllers/performance
 */
// tslint:disable-next-line:max-func-body-length
export async function search(searchConditions: ISearchConditions): Promise<ISearchResult> {
    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    const performanceStatusesRepo = new ttts.repository.PerformanceStatuses(redisClient);
    const seatReservationOfferAvailabilityRepo = new ttts.repository.itemAvailability.SeatReservationOffer(redisClient);

    // MongoDB検索条件を作成
    const andConditions: any[] = [
        { canceled: false }
    ];

    if (searchConditions.day !== undefined) {
        andConditions.push({ day: searchConditions.day });
    }

    if (searchConditions.theater !== undefined) {
        andConditions.push({ theater: searchConditions.theater });
    }

    if (searchConditions.screen !== undefined) {
        andConditions.push({ screen: searchConditions.screen });
    }

    if (searchConditions.performanceId !== undefined) {
        andConditions.push({ _id: searchConditions.performanceId });
    }

    if (searchConditions.startFrom !== undefined) {
        const now = moment(searchConditions.startFrom);
        // tslint:disable-next-line:no-magic-numbers
        const tomorrow = moment(searchConditions.startFrom).add(+24, 'hours');

        andConditions.push({
            $or: [
                {
                    day: now.format('YYYYMMDD'),
                    start_time: { $gte: now.format('HHmm') }
                },
                {
                    day: { $gte: tomorrow.format('YYYYMMDD') }
                }
            ]
        });
    }

    // 作品条件を追加する
    await addFilmConditions(
        andConditions,
        (searchConditions.section !== undefined) ? searchConditions.section : null,
        (searchConditions.words !== undefined) ? searchConditions.words : null
    );

    let conditions: any = null;
    if (andConditions.length > 0) {
        conditions = { $and: andConditions };
    }
    debug('search conditions;', conditions);

    // 作品件数取得
    const filmIds = await performanceRepo.performanceModel.distinct('film', conditions).exec();

    // 総数検索
    const performancesCount = await performanceRepo.performanceModel.count(conditions).exec();

    // 必要な項目だけ指定すること(レスポンスタイムに大きく影響するので)
    const fields = 'day open_time start_time end_time film screen screen_name theater theater_name ttts_extension';

    const page = (searchConditions.page !== undefined) ? searchConditions.page : 1;
    // tslint:disable-next-line:no-magic-numbers
    const limit = (searchConditions.limit !== undefined) ? searchConditions.limit : 1000;

    const performances = await performanceRepo.performanceModel.find(conditions, fields)
        .populate('film screen theater')
        .populate({ path: 'ticket_type_group', populate: { path: 'ticket_types' } })
        .skip(limit * (page - 1)).limit(limit)
        // 上映日、開始時刻
        .setOptions({
            sort: {
                day: 1,
                start_time: 1
            }
        })
        .exec().then((docs) => docs.map((doc) => <ttts.factory.performance.IPerformanceWithDetails>doc.toObject()));
    debug('performances found.', performances);

    // 空席情報を追加
    const performanceStatuses = await performanceStatusesRepo.find();
    debug('performanceStatuses found.', performanceStatuses);

    // const dicSuspended: any = {};
    // for (const performance of performances) {
    //     // 販売停止の時
    //     if (performance.ttts_extension.online_sales_status === ttts.factory.performance.OnlineSalesStatus.Suspended) {
    //         // dictionnaryに追加する
    //         const key = (<Date>performance.ttts_extension.online_sales_update_at).toISOString();
    //         if (dicSuspended.hasOwnProperty(key) === false) {
    //             dicSuspended[key] = [];
    //         }
    //         dicSuspended[key].push(performance.id);
    //     }
    // }
    // 停止単位で配列にセット
    // [{ performance_ids: [p1,p2,,,pn],
    //    annnouce_locales: { ja:'メッセージ', 'en':'message',･･･} }]
    // const salesSuspended: any[] = [];
    // for (const key of Object.keys(dicSuspended)) {
    //     salesSuspended.push({
    //         date: key,
    //         performance_ids: dicSuspended[key],
    //         annnouce_locales: { ja: `販売停止(${key})` }
    //     });
    // }

    const data: IPerformance[] = await Promise.all(performances.map(async (performance) => {
        const seatReservationOfferAvailabilities = await seatReservationOfferAvailabilityRepo.findByPerformance(performance.id);
        const ticketTypes = performance.ticket_type_group.ticket_types;
        const wheelchairTicketTypeIds = ticketTypes
            .filter((t) => t.ttts_extension.category === ttts.factory.ticketTypeCategory.Wheelchair)
            .map((t) => t.id);
        debug('wheelchairTicketTypeIds:', wheelchairTicketTypeIds);
        debug('seatReservationOfferAvailabilities:', seatReservationOfferAvailabilities);
        let wheelchairAvailable = 0;
        wheelchairTicketTypeIds.forEach((ticketTypeId) => {
            if (seatReservationOfferAvailabilities[ticketTypeId] !== undefined
                && seatReservationOfferAvailabilities[ticketTypeId] > 0) {
                wheelchairAvailable = seatReservationOfferAvailabilities[ticketTypeId];
            }
        });

        return {
            id: performance.id,
            attributes: {
                day: performance.day,
                open_time: performance.open_time,
                start_time: performance.start_time,
                end_time: performance.end_time,
                seat_status: performanceStatuses.getStatus(performance.id),
                // theater_name: performance.theater_name,
                // screen_name: performance.screen_name,
                // film: performance.film._id,
                // film_name: performance.film.name,
                // film_sections: performance.film.sections.map((filmSection: any) => filmSection.name),
                // film_minutes: performance.film.minutes,
                // film_copyright: performance.film.copyright,
                // film_image: `${process.env.FRONTEND_ENDPOINT}/images/film/${performance.film._id}.jpg`,
                wheelchair_available: wheelchairAvailable,
                ticket_types: ticketTypes.map((ticketType) => {
                    return {
                        ...ticketType,
                        ...{
                            available_num: seatReservationOfferAvailabilities[ticketType.id]
                        }
                    };
                }),
                tour_number: performance.ttts_extension.tour_number,
                online_sales_status: performance.ttts_extension.online_sales_status,
                refunded_count: performance.ttts_extension.refunded_count,
                refund_status: performance.ttts_extension.refund_status,
                ev_service_status: performance.ttts_extension.ev_service_status
            }
        };
    }));

    return {
        performances: data,
        numberOfPerformances: performancesCount,
        filmIds: filmIds
        // salesSuspended: salesSuspended
    };
}

/**
 * 作品に関する検索条件を追加する
 *
 * @param andConditions パフォーマンス検索条件
 * @param section 作品部門
 * @param words フリーワード
 */
async function addFilmConditions(andConditions: any[], section: string | null, words: string | null): Promise<void> {
    const filmAndConditions: any[] = [];
    if (section !== null) {
        // 部門条件の追加
        filmAndConditions.push({ 'sections.code': { $in: [section] } });
    }

    // フリーワードの検索対象はタイトル(日英両方)
    // 空白つなぎでOR検索
    if (words !== null) {
        // trim and to half-width space
        words = words.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
        const orConditions = words.split(' ').filter((value) => (value.length > 0)).reduce(
            (a: any[], word) => {
                return a.concat(
                    { 'name.ja': { $regex: `${word}` } },
                    { 'name.en': { $regex: `${word}` } }
                );
            },
            []
        );
        debug(orConditions);
        filmAndConditions.push({ $or: orConditions });
    }

    // 条件があれば作品検索してID条件として追加
    if (filmAndConditions.length > 0) {
        const filmIds = await ttts.Models.Film.distinct('_id', { $and: filmAndConditions }).exec();
        debug('filmIds:', filmIds);
        // 該当作品がない場合、filmIdsが空配列となりok
        andConditions.push({ film: { $in: filmIds } });
    }
}
