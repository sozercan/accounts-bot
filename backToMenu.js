'use strict';

var builder = require('botbuilder');

module.exports = {
    Dialog: [
        function(session, args) {
            session.dialogData.source = args.source;

            var options = ['Back to ' + args.source + ' menu', 'Back to main menu'];
            builder.Prompts.choice(session, "What would you like to do next?", options);
        },
        function(session, results, next) {
            console.log("results.response.index: " + results.response);
            switch (results.response.index) {
                case 0:
                    session.beginDialog('/' + session.dialogData.source);
                    break;
                case 1:
                default:
                    session.endDialog();
                    session.beginDialog("/");
                    break;
            }
        }
    ]
}