require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Scheduler = require('./utils/scheduler');
const { getRobloxCookie, isCookieValid, getSavedCookie } = require('./utils/robloxAuth');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction
    ]
});

client.commands = new Collection();

// ================================================
// LOAD COMMANDS
// ================================================
console.log('\n📁 Loading commands...');
const commandFolders = fs.readdirSync('./commands');
const commands = [];

for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        if (!command.data) {
            console.error(`❌ ${folder}/${file} tidak memiliki "data"!`);
            continue;
        }
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
    }
}

// ================================================
// LOAD EVENTS
// ================================================
console.log('\n📁 Loading events...');
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`✅ Loaded event: ${event.name}`);
}

// ================================================
// REGISTER SLASH COMMANDS
// ================================================
console.log('\n🔄 Registering slash commands...');
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('⏳ Refreshing global slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Global slash commands registered!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
})();

// ================================================
// ROBLOX AUTHENTICATION SETUP
// ================================================
const initializeRobloxAuth = async () => {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🔐 ROBLOX AUTHENTICATION SETUP');
        console.log('='.repeat(60));

        // Load config
        let config = {};
        const configPath = path.join(__dirname, 'config.json');
        
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('✅ Config file loaded');
        } else {
            console.log('⚠️ config.json not found, creating default...');
            config = {
                roblox: {
                    username: process.env.ROBLOX_USERNAME || '',
                    password: process.env.ROBLOX_PASSWORD || '',
                    autoCookieLogin: process.env.ROBLOX_AUTO_LOGIN !== 'false'
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            console.log('✅ Default config.json created');
        }

        // Check if manual cookie provided
        if (process.env.ROBLOX_COOKIE) {
            console.log('\n✅ Manual Roblox cookie found in environment!');
            console.log('🔑 Using provided cookie for asset downloads');
            console.log('-'.repeat(60) + '\n');
            return true;
        }

        // Check if cookie already valid
        if (isCookieValid()) {
            console.log('\n✅ Valid Roblox cookie already saved');
            console.log('🔑 Ready for authenticated asset downloads');
            console.log('-'.repeat(60) + '\n');
            return true;
        }

        // Check if auto login enabled
        if (!config.roblox || !config.roblox.autoCookieLogin) {
            console.log('\n⏭️ Roblox auto-login is DISABLED in config');
            console.log('💡 To enable: Set ROBLOX_AUTO_LOGIN=true in .env');
            console.log('-'.repeat(60) + '\n');
            return false;
        }

        // Try to login
        const username = config.roblox.username || process.env.ROBLOX_USERNAME;
        const password = config.roblox.password || process.env.ROBLOX_PASSWORD;

        if (!username || !password) {
            console.log('\n⚠️ Roblox credentials not found!');
            console.log('💡 Add to .env:');
            console.log('   ROBLOX_USERNAME=your_username');
            console.log('   ROBLOX_PASSWORD=your_password');
            console.log('\n📌 OR use manual cookie:');
            console.log('   ROBLOX_COOKIE=your_cookie_from_browser');
            console.log('-'.repeat(60) + '\n');
            return false;
        }

        console.log(`\n⏳ Attempting to login as ${username}...`);
        console.log('-'.repeat(60));

        const cookie = await getRobloxCookie(username, password);

        if (cookie) {
            console.log('\n' + '='.repeat(60));
            console.log('✅ ROBLOX AUTHENTICATION SUCCESSFUL!');
            console.log('='.repeat(60));
            console.log('🔑 Cookie saved to .roblox_auth');
            console.log('📦 Ready for authenticated asset downloads');
            console.log('⏰ Valid for 30 days\n');
            return true;
        } else {
            console.log('\n' + '='.repeat(60));
            console.log('⚠️ ROBLOX AUTHENTICATION FAILED');
            console.log('='.repeat(60));
            console.log('❌ Unable to login to Roblox');
            console.log('\n💡 Solutions:');
            console.log('1. Check username and password');
            console.log('2. Try manual cookie from browser');
            console.log('3. Check if account is locked');
            console.log('4. Wait if rate-limited');
            console.log('\n📌 To use manual cookie:');
            console.log('   1. Login to Roblox in browser');
            console.log('   2. Press F12 → Application → Cookies');
            console.log('   3. Copy .ROBLOSECURITY value');
            console.log('   4. Add to .env: ROBLOX_COOKIE=...');
            console.log('\n❓ Downloads will use public methods only (limited access)\n');
            return false;
        }

    } catch (error) {
        console.error('\n❌ Error in Roblox authentication setup:', error.message);
        console.log('❓ Downloads will use public methods only (limited access)\n');
        return false;
    }
};

// ================================================
// BOT READY EVENT
// ================================================
client.once('ready', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ DISCORD BOT READY');
    console.log('='.repeat(60));
    console.log(`🤖 Bot: ${client.user.tag}`);
    console.log(`📅 Time: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
    console.log(`🎫 Prefix: Slash Commands (/)`);
    console.log('='.repeat(60) + '\n');

    // Initialize Roblox authentication
    const authSuccess = await initializeRobloxAuth();
    client.robloxAuthReady = authSuccess;

    // Initialize scheduler
    console.log('='.repeat(60));
    console.log('📅 SCHEDULER INITIALIZATION');
    console.log('='.repeat(60));
    
    const scheduler = new Scheduler(client);
    scheduler.start();
    client.scheduler = scheduler;

    console.log('✅ Scheduler started successfully');
    console.log('📅 Next monthly leaderboard: 1st of next month at 07:00 WIB');
    console.log('='.repeat(60) + '\n');

    // Set bot activity
    client.user.setActivity('/download - Roblox Asset Downloader', { 
        type: 'PLAYING' 
    });

    console.log(`✅ Bot status set: /download - Roblox Asset Downloader\n`);
    console.log(`${'='.repeat(60)}`);
    console.log('🚀 BOT IS READY!');
    console.log(`${'='.repeat(60)}\n`);
});

// ================================================
// INTERACTION HANDLER
// ================================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.warn(`❌ Command not found: ${interaction.commandName}`);
            return;
        }

        try {
            console.log(`\n📍 Command: /${interaction.commandName}`);
            console.log(`👤 User: ${interaction.user.tag}`);
            console.log(`🏢 Guild: ${interaction.guild?.name || 'DM'}`);
            
            await command.execute(interaction);
            
            console.log(`✅ Command executed successfully\n`);
        } catch (error) {
            console.error(`❌ Command error (${interaction.commandName}):`, error);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ Terjadi error saat menjalankan command',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ Terjadi error saat menjalankan command',
                    ephemeral: true
                });
            }
        }
    }
});

// ================================================
// ERROR HANDLERS
// ================================================
client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});

// ================================================
// BOT LOGIN
// ================================================
console.log('\n' + '='.repeat(60));
console.log('🔓 LOGGING IN TO DISCORD...');
console.log('='.repeat(60) + '\n');

if (!process.env.TOKEN) {
    console.error('❌ Discord token not found in .env file');
    console.error('⚠️ Please add TOKEN=your_bot_token to .env');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ Client ID not found in .env file');
    console.error('⚠️ Please add CLIENT_ID=your_client_id to .env');
    process.exit(1);
}

client.login(process.env.TOKEN);

// ================================================
// GRACEFUL SHUTDOWN
// ================================================
process.on('SIGINT', async () => {
    console.log('\n\n' + '='.repeat(60));
    console.log('🛑 SHUTTING DOWN BOT...');
    console.log('='.repeat(60));
    
    if (client.scheduler) {
        client.scheduler.stop();
        console.log('✅ Scheduler stopped');
    }
    
    await client.destroy();
    console.log('✅ Bot disconnected');
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
});

module.exports = client;
