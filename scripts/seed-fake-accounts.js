const storage = require('../src/storage');

const majors = ['Natural Sciences', 'Social Sciences', 'Arts and Humanities'];
const years = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const languagesPool = ['English', 'Chinese', 'Spanish', 'German', 'Japanese', 'Korean'];
const lookingForPool = ['Activity partner', 'Close friendship', 'Academic partner', 'Networking / career', 'Casual socializing'];
const interestsPool = ['Performing arts', 'Research / academic discussion', 'Sports / fitness', 'Volunteering', 'Entrepreneurship', 'Social events', 'Gaming / online communities'];
const qualitiesPool = ['Reliability', 'Humor', 'Emotional support', 'Intellectual discussion', 'Shared hobbies', 'Adventurousness'];

function pickDistinct(pool, count, seed) {
  const used = new Set();
  const out = [];
  let i = 0;
  while (out.length < count && i < pool.length * 3) {
    const idx = (seed + i * 7) % pool.length;
    const v = pool[idx];
    if (!used.has(v)) {
      used.add(v);
      out.push(v);
    }
    i += 1;
  }
  return out;
}

function likert(seed, bias = 0) {
  return ((seed + bias) % 5) + 1;
}

function makeUser(i) {
  const netid = `tu${String(i + 1).padStart(3, '0')}`;
  const seed = i * 11 + 3;

  const user = {
    netid,
    major: majors[i % majors.length],
    year: years[(i + 1) % years.length],
    languages: pickDistinct(languagesPool, 2 + (i % 2), seed),
    lookingFor: pickDistinct(lookingForPool, 1 + (i % 2), seed + 2),
    activityInterests: pickDistinct(interestsPool, 2 + (i % 2), seed + 4),
    dkuOpenness: likert(seed, 0),
    interactionStyle: likert(seed, 1),
    opennessToNewActivities: likert(seed, 2),
    planningStyle: likert(seed, 3),
    socialEnergy: likert(seed, 4),
    communicationStyle: likert(seed, 5),
    conversationPreference: likert(seed, 6),
    decisionMaking: likert(seed, 7),
    conflictHandling: likert(seed, 8),
    emotionalSharing: likert(seed, 9),
    qualities: pickDistinct(qualitiesPool, 2, seed + 6)
  };

  return user;
}

const fakeUsers = Array.from({ length: 20 }, (_, i) => makeUser(i));

(async () => {
  for (const u of fakeUsers) {
    await storage.upsertUser({
      netid: u.netid,
      email: `${u.netid}@duke.edu`
    });
    await storage.saveSurvey({ ...u });
  }
  console.log(`Seeded ${fakeUsers.length} fake accounts with survey data.`);
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
