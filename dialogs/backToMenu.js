'use strict';

var builder = require('botbuilder');

module.exports = {
    Dialog: [
        function(session, args) {
            session.dialogData.source = args.source;

            var options = ['Back to ' + args.source + ' menu', 'Back to main menu'];

            var msg = new builder.Message(session)
                .attachmentLayout(builder.AttachmentLayout.list)
                .attachments([
                    new builder.HeroCard(session)
                        .title("What would you like to do next?")
                        .buttons([
                            builder.CardAction.imBack(session, options[0], options[0]),
                            builder.CardAction.imBack(session, options[1], options[1])
                        ]),
            ]);

            builder.Prompts.choice(session, msg, options);
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