/**
 * MongoDBコネクション確立
 */
import * as createDebug from 'debug';
import * as mongoose from 'mongoose';

const debug = createDebug('@alverca/api:connectMongo');
const PING_INTERVAL = 10000;
const MONGOLAB_URI = <string>process.env.MONGOLAB_URI;

const connectOptions: mongoose.ConnectionOptions = {
    autoIndex: true,
    autoReconnect: true,
    keepAlive: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    reconnectTries: 30,
    reconnectInterval: 1000,
    useNewUrlParser: true
};

export async function connectMongo(params: {
    defaultConnection: boolean;
}) {
    let connection: mongoose.Connection;
    if (params === undefined || params.defaultConnection) {
        // コネクション確立
        await mongoose.connect(MONGOLAB_URI, connectOptions);
        connection = mongoose.connection;
    } else {
        connection = mongoose.createConnection(MONGOLAB_URI, connectOptions);
    }

    // 定期的にコネクションチェック
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    setInterval(
        async () => {
            // すでに接続済かどうか
            if (connection.readyState === 1) {
                // 接続済であれば疎通確認
                let pingResult: any;
                await new Promise<void>(async (resolve) => {
                    try {
                        pingResult = await connection.db.admin()
                            .ping();
                        debug('pingResult:', pingResult);
                    } catch (error) {
                        // tslint:disable-next-line:no-console
                        console.error('ping:', error);
                    }

                    // tslint:disable-next-line:no-magic-numbers
                    setTimeout(() => { resolve(); }, 5000);
                });

                // 疎通確認結果が適性であれば何もしない
                if (pingResult !== undefined && pingResult.ok === 1) {
                    return;
                }
            }

            try {
                // コネクション再確立
                await connection.close();
                await connection.openUri(MONGOLAB_URI, connectOptions);
                debug('MongoDB reconnected!');
                // tslint:disable-next-line:no-console
                console.error('MongoDB connection reestablished!');
            } catch (error) {
                // tslint:disable-next-line:no-console
                console.error('MongoDB connection error:', error);
            }
        },
        PING_INTERVAL
    );

    return connection;
}
