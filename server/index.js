const express = require('express');
const Ably = require('ably');
const { nanoid } = require('nanoid');

const app = express();

const ably = Ably.Realtime(process.env.NUXT_ENV_ABLY_PRIVATE_KEY);
ably.connection.on(function(stateChange) {
    console.log('New connection state is ' + stateChange.current);
  });

app.use(express.urlencoded({extended: true}));
app.use(express.json()) // To parse the incoming requests with JSON payloads

app.post("/ably/auth", (req, res) => {
    const uniqueID = nanoid();
    ably.auth.createTokenRequest({ clientId: uniqueID, foo: 'bar' }, (err, tokenRequest) => {
        if (err) {
            console.error(err);
            res.status(500);
            res.send(err);
        } else {
            res.send(tokenRequest);
        }
    });
});

app.post('/turn/change', (req, res) => {
    try {
        const { turn } = req.body
        const turnChannel = ably.channels.get('turn');
     
        turnChannel.publish('change', {
            turn,
            timestamp: new Date().getTime(),
        })

        if (turn !== 'end') {
            turnChannel.publish('start_timer', {
                team: turn
            })
        }
    
        if (turn.includes('spymaster')) {
            const cardsChannel = ably.channels.get('cards:fff')
            cardsChannel.publish('reset_taps', { all: true })

            turnChannel.publish('reset_end_turn_taps', { all: true })
        }
    
        res.status(200).json({ success: 'ok' })
    } catch(err) {
        res.status(500).json({ error: err})
    }
})

app.post('/turn/timer', (req, res) => {
    const { team } = req.body
    const turnChannel = ably.channels.get('turn')
    turnChannel.publish('start_timer', {
        team
    })

    return res.send({ status: 200 })
})

app.post('/cards/reset_taps', (req, res) => {
    try {
        const cardsChannel = ably.channels.get('cards:fff')
        cardsChannel.publish('reset_taps', { all: true })

        res.status(200).json({ success: 'ok' })
    } catch(err) {
        res.status(500).json({ error: err })
    }
})

app.post('/cards/remove_tap', (req, res) => {
    const { clientId } = req.body

    const cardsChannel = ably.channels.get('cards:fff')
    cardsChannel.publish('remove_tap', {
        clientId
    })

    return res.send({ status: 200 })
})

app.post('/cards/open', (req, res) => {
    const { word } = req.body

    const cardsChannel = ably.channels.get('cards:fff')
    cardsChannel.publish('open', { word })
})

app.post('/clues/add', (req, res) => {
    const { clue, team } = req.body

    const cluesChannel = ably.channels.get('clues:fff')
    cluesChannel.publish('add', {
        clue,
        team,
    })

    res.status(200).json({ success: 'ok' })
})

app.post('/test', (req, res) => {
    res.status(222).end();
})

module.exports = app;
