/**
 * 売上レポートルーター
 */
import * as alverca from '@alverca/domain';

import * as createDebug from 'debug';
import { Router } from 'express';
import { query } from 'express-validator';
import * as fastCsv from 'fast-csv';
import * as iconv from 'iconv-lite';
import * as moment from 'moment-timezone';
import * as mongoose from 'mongoose';

import permitScopes from '../middlewares/permitScopes';
import validator from '../middlewares/validator';

const debug = createDebug('@alverca/api:router');

// カラム区切り(タブ)
const CSV_DELIMITER: string = '\t';
// 改行コード(CR+LF)
const CSV_LINE_ENDING: string = '\r\n';

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
            const limit = (typeof req.query.limit === 'number') ? Math.min(req.query.limit, 100) : 100;
            const page = (typeof req.query.page === 'number') ? Math.max(req.query.page, 1) : 1;

            const reportRepo = new alverca.repository.Report(mongoose.connection);
            const andConditions: any[] = [
                { 'project.id': { $exists: true, $eq: req.project?.id } }
            ];
            if (Array.isArray(req.query.$and)) {
                andConditions.push(...req.query.$and);
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

/**
 * ストリーミング検索
 */
aggregateSalesRouter.get(
    '/stream',
    permitScopes(['admin']),
    ...[
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
    // tslint:disable-next-line:max-func-body-length
    async (req, res, next) => {
        try {
            const reportRepo = new alverca.repository.Report(mongoose.connection);
            debug('finding aggregateSales...', req.query);
            const andConditions: any[] = [
                { 'project.id': { $exists: true, $eq: req.project?.id } }
            ];
            if (Array.isArray(req.query.$and)) {
                andConditions.push(...req.query.$and);
            }
            const cursor = reportRepo.aggregateSaleModel.find(
                (Array.isArray(andConditions) && andConditions.length > 0) ? { $and: andConditions } : {}
            )
                .sort({ sortBy: 1 })
                .cursor();

            // Mongoドキュメントをcsvデータに変換するtransformer
            const transformer = (doc: alverca.factory.report.order.IReport) => {
                const eventDate = moment(doc.reservation.reservationFor.startDate)
                    .toDate();
                const dateRecorded: string = // 万が一入塔予約日時より明らかに後であれば、間違ったデータなので調整
                    (moment(doc.dateRecorded)
                        .isAfter(moment(eventDate)
                            .add(1, 'hour')))
                        ? moment(doc.dateRecorded)
                            // tslint:disable-next-line:no-magic-numbers
                            .add(-9, 'hours')
                            .tz('Asia/Tokyo')
                            .format('YYYY/MM/DD HH:mm:ss')
                        : moment(doc.dateRecorded)
                            .tz('Asia/Tokyo')
                            .format('YYYY/MM/DD HH:mm:ss');

                const dateUsed = doc.reservation.reservedTicket?.dateUsed;
                const attended = dateUsed !== undefined && dateUsed !== null;
                const attendDate: string = // 万が一入塔予約日時より明らかに前であれば、間違ったデータなので調整
                    (attended)
                        ? (moment(dateUsed)
                            .isBefore(moment(eventDate)
                                // tslint:disable-next-line:no-magic-numbers
                                .add(-3, 'hour')))
                            ? moment(dateUsed)
                                // tslint:disable-next-line:no-magic-numbers
                                .add(9, 'hours')
                                .tz('Asia/Tokyo')
                                .format('YYYY/MM/DD HH:mm:ss')
                            : moment(dateUsed)
                                .tz('Asia/Tokyo')
                                .format('YYYY/MM/DD HH:mm:ss')
                        : '';

                let seatNumber = doc.reservation?.reservedTicket?.ticketedSeat?.seatNumber;
                let ticketTypeName = doc.reservation?.reservedTicket?.ticketType?.name?.ja;
                let csvCode = doc.reservation?.reservedTicket?.ticketType?.csvCode;
                let unitPrice = (typeof doc.reservation?.reservedTicket?.ticketType?.priceSpecification?.price === 'number')
                    ? String(doc.reservation?.reservedTicket?.ticketType?.priceSpecification?.price)
                    : '';
                let paymentSeatIndex = (typeof doc.payment_seat_index === 'string' || typeof doc.payment_seat_index === 'number')
                    ? String(doc.payment_seat_index)
                    : '';
                // 返品手数料の場合、値を調整
                if (doc.category === alverca.factory.report.order.ReportCategory.CancellationFee) {
                    seatNumber = '';
                    ticketTypeName = '';
                    csvCode = '';
                    unitPrice = String(doc.amount);
                    paymentSeatIndex = '';
                }

                // Return an object with all fields you need in the CSV
                return {
                    購入番号: String(doc.mainEntity?.confirmationNumber),
                    パフォーマンスID: doc.reservation?.reservationFor?.id,
                    座席コード: seatNumber,
                    予約ステータス: doc.category,
                    入塔予約年月日: moment(doc.reservation.reservationFor.startDate)
                        .tz('Asia/Tokyo')
                        .format('YYYYMMDD'),
                    入塔予約時刻: moment(doc.reservation.reservationFor.startDate)
                        .tz('Asia/Tokyo')
                        .format('HHmm'),
                    '---a': '',
                    '---b': '',
                    '---c': '',
                    '---d': '',
                    '---e': '',
                    購入者区分: doc.mainEntity?.customer?.group,
                    '購入者（名）': doc.mainEntity?.customer?.givenName,
                    '購入者（姓）': doc.mainEntity?.customer?.familyName,
                    購入者メール: doc.mainEntity?.customer?.email,
                    購入者電話: doc.mainEntity?.customer?.telephone,
                    購入日時: dateRecorded,
                    決済方法: doc.mainEntity?.paymentMethod,
                    '---f': '',
                    '---g': '',
                    券種名称: ticketTypeName,
                    チケットコード: csvCode,
                    券種料金: unitPrice,
                    客層: doc.mainEntity?.customer?.segment,
                    payment_seat_index: paymentSeatIndex,
                    予約単位料金: String(doc.amount),
                    ユーザーネーム: doc.mainEntity?.customer?.username,
                    入場フラグ: (attended) ? 'TRUE' : 'FALSE',
                    入場日時: attendDate
                };
            };

            // Create a Fast CSV stream which transforms documents to objects
            const csvStream = fastCsv
                .createWriteStream({
                    headers: true,
                    delimiter: CSV_DELIMITER,
                    quoteColumns: true,
                    rowDelimiter: CSV_LINE_ENDING
                    // includeEndRowDelimiter: true
                    // quote: '"',
                    // escape: '"'
                })
                .transform(transformer);

            // sjisに変換して流し込む
            cursor.pipe(csvStream)
                .pipe(iconv.decodeStream('utf-8'))
                .pipe(iconv.encodeStream('windows-31j'))
                .pipe(res);
        } catch (error) {
            next(error);
        }
    }
);

export default aggregateSalesRouter;
