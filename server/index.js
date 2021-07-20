const express = require('express');
const Ably = require('ably');
const { nanoid } = require('nanoid');

const app = express();

const ably = Ably.Realtime(process.env.NUXT_ENV_ABLY_PRIVATE_KEY);

app.use(express.urlencoded({extended: true}));
app.use(express.json()) // To parse the incoming requests with JSON payloads

app.post("/ably/auth", (req, res) => {
    const uniqueID = nanoid();
    ably.auth.createTokenRequest({ clientId: uniqueID, foo: 'bar' }, (err, tokenRequest) => {
        if (err) {
            console.log(err);
            res.status(500);
            res.send(err);
        } else {
            res.send(tokenRequest);
        }
    });
});

app.post('/turn/change', (req, res) => {
    const { turn } = req.body
    const turnChannel = ably.channels.get('turn');
    turnChannel.publish('change', {
        turn,
    })
    turnChannel.publish('start_timer', {
        team: turn
    })

    const cardsChannel = ably.channels.get('cards')
    cardsChannel.publish('reset_taps', {
        all: true
    })

    return res.send({ status: 200 })
})

app.post('/turn/timer', (req) => {
    const { team } = req.body
    const turnChannel = ably.channels.get('turn')
    turnChannel.publish('start_timer', {
        team
    })

    return res.send({ status: 200 })
})

app.post('/cards/reset_taps', () => {
    const cardsChannel = ably.channels.get('cards')
    cardsChannel.publish('reset_taps', {
        all: true,
    })

    return res.send({ status: 200 })
})

app.post('/cards/remove_tap', (req, res) => {
    const { clientId } = req.body

    const cardsChannel = ably.channels.get('cards')
    cardsChannel.publish('remove_tap', {
        clientId
    })

    return res.send({ status: 200 })
})

module.exports = app;
