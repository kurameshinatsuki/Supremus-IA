const { getAllCommands } = require('./index');

async function execute(args, msg, sock) {
    const commands = getAllCommands();
    
    let helpText = "📚 Commandes disponibles :\n";
    commands.forEach(cmd => {
        helpText += `• /${cmd.name} - ${cmd.description}\n`;
    });

    return helpText;
}

module.exports = {
    name: 'help',
    description: 'Affiche les commandes disponibles',
    execute
};
