const PLOT_CARDS = [
  "A time traveler discovers their past was actually someone else's future",
  "A small town wakes up to find everyone's shadows have disappeared",
  "A chef can taste memories but only the sad ones",
  "An astronaut returns to Earth to find it has been empty for 200 years",
  "A library where every book is a different version of the reader's life",
  "A weather forecaster discovers their predictions are causing the weather",
  "A city where everyone shares the same dream but nobody knows it",
  "A gardener grows a plant that blooms once every thousand years",
  "A detective can hear the last thought of any object they touch",
  "A musician's song starts healing people but slowly takes their memories",
];

const CHARACTER_CARDS = [
  "A retired villain who runs a bakery",
  "A detective who is secretly three raccoons in a trench coat",
  "A grandmother who was a spy in the 1970s",
  "A lighthouse keeper who talks to the sea",
  "A child who can see 5 minutes into the future",
  "A robot butler who has developed a passion for jazz",
  "A wizard who has forgotten every spell except one",
  "A mail carrier who delivers letters between dimensions",
  "A museum night guard who befriends the exhibits",
  "A fortune teller who is always wrong but in a helpful way",
];

const NOTE_CARDS = [
  "Add a musical number",
  "The lead actor must cry for real",
  "Include a 5-minute car chase",
  "The villain must be the hero's own reflection",
  "Everyone in the movie must speak in rhyme",
  "Add a flashback to a flashback",
  "The movie must end on a cliffhanger",
  "Add a CGI talking animal sidekick",
  "The soundtrack must be entirely kazoos",
  "Halfway through, the movie must switch genres",
];

export function getSeedCards() {
  return { plot: PLOT_CARDS, character: CHARACTER_CARDS, note: NOTE_CARDS };
}