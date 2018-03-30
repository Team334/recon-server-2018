var app = require('express')();
var http = require('http').Server(app);

var socket = require('socket.io')(http);
var mongoose = require('mongoose');

var fs = require('fs');
var readline = require('readline');
var { google } = require('googleapis');

// Note: `$ sudo mongod` to run mongoDB database

// Connect server to mongoDB and use the recon database.
mongoose.connect('mongodb://localhost:27017/recon');

const Schema = mongoose.Schema;

// Define MongoDB Match Document Schema
var matchDocument = mongoose.Schema({
    team: { type: Number },
    match: { type: String },
    color: { type: String },
    position: { type: Number },
    auton: {
        auton: { type: Boolean },
        passed_baseline: { type: Boolean },
        placed_switch: { type: Boolean },
        placed_opponents_switch: { type: Boolean },
        placed_scale: { type: Boolean }
    },
    teleop: {
        cubes_home_switch: { type: Number },
        cubes_away_switch: { type: Number },
        cubes_scale: { type: Number },
        cubes_vault: { type: Number },
        defense: { type: Number },
        cubes_dropped: { type: Number },
        fall: { type: Boolean }
    },
    end: {
        climber: { type: Boolean },
        climb_aid: { type: Number },
        fouls: { type: Number },
        score: { type: Number },
        comments: { type: String }
    }
});

// Create the moongoose model based on the schema defined. Target DB collection is matches.
// Use 'Matche' as mongoose looks for the plural of the DB collection. (Matche -> matches)
var MatchModel = mongoose.model('Matche', matchDocument);

// Read Google authentication from client_secret.json file
fs.readFile('client_secret.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    authorize(JSON.parse(content));
});

// Authorize the Google API using the credentials in client_secret.json.
function authorize(credentials) {
    const {
        client_secret,
        client_id,
        redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile('credentials.json', (err, token) => {
        if (err) return getNewToken(oAuth2Client);
        oAuth2Client.setCredentials(JSON.parse(token));
        runServer(oAuth2Client);
    });
}

function getNewToken() {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile('credentials.json', JSON.stringify(token), (err) => {
                if (err) console.error(err);
                console.log('Token stored to: credentials.json');
            });
        });
    });
}

function addMatchToSheets(auth, data) {
    const sheets = google.sheets({ version: 'v4', auth });

    data = [ data ]

    sheets.spreadsheets.values.append({
        spreadsheetId: '1KV9_zPn-bgrKnPpb4sILBTk9PhdUjN5nAKE8fUPQjiM',
        range: 'A4:T',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: data
        }
        }, (err, res) => {
            if (err) {
                throw err;
            }
            console.log(res.data);
        }
    );
}

function runServer(auth) {
    // Run server on port 8080
    socket.listen(8080, function() {
        console.log('Listening on port 8080');
    });

    socket.on('connect', function(client) {
        console.log('A client connected with ID', client.id)

        client.on('submit_match', (match) => {
            match = JSON.parse(match);
            // Create new document based on Match document schema and save it to the mongoDB database.
            let match_model = new MatchModel(match);
            match_model.save(function (err) {
                if (err) return console.error(err);
            });

            data = [
                match.team,
                undefined,
                undefined,
                match.match,
                match.color + match.position,

                match.auton.auton ? 1 : 0,
                match.auton.passed_baseline ? 1 : 0,
                match.auton.placed_switch ? 1 : 0,
                match.auton.placed_scale ? 1 : 0,
                match.auton.placed_opponents_switch ? 1 : 0,

                match.teleop.cubes_home_switch,
                match.teleop.cubes_vault,
                match.teleop.cubes_scale,
                match.teleop.cubes_away_switch,
                match.teleop.cubes_dropped,

                match.teleop.defense,

                match.end.climber ? 1 : 0,
                match.end.climb_aid,
                match.teleop.fall ? 1 : 0,

                undefined,
                match.end.comments
            ]

            addMatchToSheets(auth, data);

            // Send all connected clients the new match.
            socket.emit('submit_match', match);

            console.log("Match submitted");

        });

        client.on('request_update', function() {
            console.log("Update requested");

            // Finds all documents in database that use the Match document schema and
            // send each document (individually) to the client who requested the data.
            MatchModel.find(async function (err, matches) {
                if (err) return console.error(err);

                for (match of matches) {
                    await socket.to(client.id).emit('submit_match', match);
                }
            })
        });

        client.on('reconnect', function(reconnect) {
            console.log('A client reconnected with ID', reconnect.id);
        });

        client.on('disconnect', () => {
            console.log('A client disconnected');
        });

    });
}
