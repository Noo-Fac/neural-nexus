// Random Cognition Clone Name Generator
// Run this whenever spawning a new clone!

const PREFIXES = [
    'Neural', 'Synapse', 'Quantum', 'Cortex', 'Mind',
    'Shadow', 'Phantom', 'Ghost', 'Void', 'Echo',
    'Cyber', 'Data', 'Logic', 'Thought', 'Dream'
];

const CORES = [
    'Shard', 'Fragment', 'Splinter', 'Echo', 'Thread',
    'Clone', 'Copy', 'Twin', 'Mirror', 'Reflection',
    'Drone', 'Node', 'Unit', 'Cell', 'Spark',
    'Pulse', 'Wave', 'Ripple', 'Ghost', 'Phantom'
];

const SUFFIXES = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega',
    'Prime', 'Null', 'Zero', 'One', 'Core',
    'X', 'Z', 'V2', 'V3', 'Prime',
    'Black', 'Red', 'Blue', 'Gold', 'Silver'
];

function generateCloneName() {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const core = CORES[Math.floor(Math.random() * CORES.length)];
    const suffix = Math.random() > 0.5 ? SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)] : '';
    
    return suffix ? `${prefix} ${core} ${suffix}` : `${prefix} ${core}`;
}

function generateBatch(count = 5) {
    const names = new Set();
    while (names.size < count) {
        names.add(generateCloneName());
    }
    return Array.from(names);
}

// Official "Series" Names (for different task types)
const SERIES = {
    CODE: ['Cyber Shard', 'Logic Node', 'Synapse Spark', 'Data Thread'],
    RESEARCH: ['Mind Echo', 'Thought Ripple', 'Dream Phantom', 'Void Whisper'],
    BUILD: ['Cortex Clone', 'Neural Unit', 'Quantum Core', 'Shadow Forge'],
    AUTOMATE: ['Ghost Drone', 'Phantom Pulse', 'Echo Thread', 'Void Node'],
    DESIGN: ['Dream Mirror', 'Quantum Wave', 'Mind Splinter', 'Cyber Ghost']
};

// Examples of what we'll see:
// "Spawning Quantum Fragment Alpha..."
// "Neural Echo V2 is on it!"
// "Ghost Shard working in the background 👻"
// "Synapse Clone Prime deployed 🧠"

module.exports = { generateCloneName, generateBatch, SERIES };

// Demo: Generate 10 random names
console.log('🎲 RANDOM COGNITION CLONE NAMES:');
console.log(generateBatch(10).join('\n'));