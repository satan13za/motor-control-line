const express = require('express');
const { Client } = require('@line/bot-sdk');

const app = express();
app.use(express.json());

const client = new Client({ 
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, 
    channelSecret: process.env.CHANNEL_SECRET 
});

let motorCommand = "OFF";
let lastReportedState = "STANDBY";
let targetUserId = process.env.USER_ID || null;

app.get('/', (req, res) => {
    res.send('Server is Online and Motor Controller API is ready!');
});

app.post('/api/motor/report', (req, res) => {
    const { state } = req.body;
    console.log(`[Report] รับค่า: ${state}`);
    
    if (state && state !== lastReportedState) {
        lastReportedState = state;
        if (targetUserId) {
            client.pushMessage(targetUserId, {type:'text', text:`📊 สถานะ: ${state}`})
                .catch(err => console.error("Line Push Error:", err));
        }
    }
    res.sendStatus(200);
});

app.get('/api/motor/command', (req, res) => {
    res.json({ command: motorCommand });
});

app.post('/webhook', (req, res) => {
    req.body.events.forEach(event => {
        if (event.source.userId) targetUserId = event.source.userId;
        if (event.type === 'message' && event.message.text) {
            const text = event.message.text.trim();
            if (text === "เปิด") motorCommand = "ON";
            else if (text === "ปิด") motorCommand = "OFF";
            client.replyMessage(event.replyToken, {type: 'text', text: `รับคำสั่ง: ${text}`});
        }
    });
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
