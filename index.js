var app = require('express')();
var http = require('http').Server(app);

var socket = require('socket.io')(http);
var mongoose = require('mongoose');

// Note: `$ sudo mongod` to run mongoDB database

// Connect server to mongoDB and use the recon database.
mongoose.connect('mongodb://localhost:27017/recon');

const Schema = mongoose.Schema;

// Define MongoDB Match Document Schema
var matchDocument = mongoose.Schema({
    team: { type: Number },
    match: { type: Number },
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

// Run server on port 8080
socket.listen(8080, function() {
    console.log('Listening on port 8080');
});

socket.on('connect', function(client) {
    console.log('A client connected with ID', client.id)

    client.on('submit_match', (message) => {
        console.log("Match submitted");

        // Create new document based on Match document schema and save it to the mongoDB database.
        let match = new MatchModel(JSON.parse(message));
        match.save(function (err) {
            if (err) return console.error(err);
        });

        // Send all connected clients the new match.
        socket.emit('submit_match', match);
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
