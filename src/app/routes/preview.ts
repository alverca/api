/**
 * previewルーター
 */
import * as cinerinoapi from '@cinerino/sdk';
import * as ttts from '@tokyotower/domain';
import { Router } from 'express';
import * as moment from 'moment';
import * as mongoose from 'mongoose';

const USE_NEW_PERFORMANCES_WITH_AGGREGATION = process.env.USE_NEW_PERFORMANCES_WITH_AGGREGATION === '1';

const project = {
    typeOf: <cinerinoapi.factory.chevre.organizationType.Project>cinerinoapi.factory.chevre.organizationType.Project,
    id: <string>process.env.PROJECT_ID
};

const previewRouter = Router();

const redisClient = ttts.redis.createClient({
    host: <string>process.env.REDIS_HOST,
    port: Number(<string>process.env.REDIS_PORT),
    password: <string>process.env.REDIS_KEY,
    tls: { servername: <string>process.env.REDIS_HOST }
});

const cinerinoAuthClient = new cinerinoapi.auth.ClientCredentials({
    domain: <string>process.env.CINERINO_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.CINERINO_CLIENT_ID,
    clientSecret: <string>process.env.CINERINO_CLIENT_SECRET,
    scopes: [],
    state: ''
});

// 集計データーつきのパフォーマンス検索
previewRouter.get('/performancesWithAggregation', async (req, res, next) => {
    try {
        if (USE_NEW_PERFORMANCES_WITH_AGGREGATION) {
            const conditions: ttts.factory.performance.ISearchConditions = {
                // tslint:disable-next-line:no-magic-numbers
                limit: (req.query.limit !== undefined) ? Number(req.query.limit) : 100,
                page: (req.query.page !== undefined) ? Math.max(Number(req.query.page), 1) : 1,
                startFrom: (typeof req.query.startFrom === 'string')
                    ? moment(req.query.startFrom)
                        .toDate()
                    : undefined,
                startThrough: (typeof req.query.startThrough === 'string')
                    ? moment(req.query.startFrom)
                        .toDate()
                    : undefined
            };

            const performanceRepo = new ttts.repository.Performance(mongoose.connection);

            const searchPerformanceResult = await ttts.service.performance.search(conditions)(
                performanceRepo,
                new ttts.repository.EventWithAggregation(redisClient)
            );

            res.json(searchPerformanceResult.performances);
        } else {
            const performanceWithAggregationRepo = new ttts.repository.EventWithAggregation(redisClient);
            let performancesWithAggregation = await performanceWithAggregationRepo.findAll();

            if (req.query.startFrom !== undefined) {
                const startFrom = moment(req.query.startFrom)
                    .unix();
                performancesWithAggregation = performancesWithAggregation.filter(
                    (p) => moment(p.startDate)
                        .unix() >= startFrom
                );
            }

            if (req.query.startThrough !== undefined) {
                const startThrough = moment(req.query.startThrough)
                    .unix();
                performancesWithAggregation = performancesWithAggregation.filter(
                    (p) => moment(p.startDate)
                        .unix() <= startThrough
                );
            }

            res.json(performancesWithAggregation);
        }
    } catch (error) {
        next(new ttts.factory.errors.ServiceUnavailable(error.message));
    }
});

// 入場場所検索
previewRouter.get('/places/checkinGate', async (__, res, next) => {
    try {
        // chevreで取得
        const placeService = new cinerinoapi.service.Place({
            auth: cinerinoAuthClient,
            endpoint: <string>process.env.CINERINO_API_ENDPOINT,
            project: { id: project.id }
        });
        const searchMovieTheatersResult = await placeService.searchMovieTheaters({});
        const movieTheater = searchMovieTheatersResult.data.shift();
        if (movieTheater === undefined) {
            throw new ttts.factory.errors.NotFound('MovieTheater');
        }

        let entranceGates = movieTheater.hasEntranceGate;
        if (!Array.isArray(entranceGates)) {
            entranceGates = [];
        }

        res.json(entranceGates.map((g) => {
            return {
                ...g,
                name: (typeof g.name === 'string') ? g.name : String(g.name?.ja)
            };
        }));

        // const checkinGateRepo = new ttts.repository.place.CheckinGate(redisClient);
        // const checkinGates = await checkinGateRepo.findAll();
        // res.json(checkinGates);
    } catch (error) {
        next(new ttts.factory.errors.ServiceUnavailable(error.message));
    }
});

export default previewRouter;
