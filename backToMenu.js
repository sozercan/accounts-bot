var builder = require('botbuilder');

module.exports = {
    Dialog: [
        function(session, args) {
            builder.Prompts.choice(session, "What would you like to do next?", 'Back to ' + args.source + ' menu|Back to main menu');
        },
        function(session, results, next) {
            switch (results.response.index) {
                case 0:
                    session.beginDialog('/' + args.source);
                    break;
                case 1:
                    session.endDialog();
                    session.beginDialog("/");
                    break;
                default:
                    break;
            }
        }
    ]
}