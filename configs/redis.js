import createClient from 'redis'

export const redisclient = createClient({
    username: 'default',
    password: 'qRngAg392RGe0g2vj5RQ7kqoxVtmkkDk',
    socket: {
        host: 'redis-16183.c8.us-east-1-4.ec2.redns.redis-cloud.com',
        port: 16183
    }
});







