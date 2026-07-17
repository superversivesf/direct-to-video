export function Rules() {
  return (
    <div className="rules-page">
      <h1>How to Play Direct to Video</h1>

      <section>
        <h2>Overview</h2>
        <p>
          Direct to Video is a party game where players take turns as unprepared writers
          pitching terrible movie ideas to each other. Each round, one player is the
          Note Giver — they manage the timer and play twist notes into everyone else's
          pitches. After all pitches, everyone votes on the best movie.
        </p>
        <p className="clone-acknowledgment">
          Direct to Video is an unofficial clone of <a href="https://boardgamegeek.com/boardgame/254132/pitchstorm" target="_blank" rel="noopener noreferrer">Pitch Storm</a> by Cutlass &amp; Cape Games. All credit for the game design and card content goes to them.
        </p>
      </section>

      <section>
        <h2>Components</h2>
        <ul>
          <li><strong>Plot Cards</strong> — story premises for your movie</li>
          <li><strong>Character Cards</strong> — characters in your movie</li>
          <li><strong>Note Cards</strong> — twist notes the Note Giver forces into your pitch</li>
        </ul>
        <p>Each movie is made from one Plot card and one Character card.</p>
      </section>

      <section>
        <h2>Setup</h2>
        <ol>
          <li>One player creates a room and shares the 4-letter room code with everyone.</li>
          <li>Other players join using the room code. Anyone can join as Audience to watch and vote.</li>
          <li>The host picks how many rounds to play: 3, 5, 7, or 10 (default 5).</li>
          <li>The host clicks "Start Game" when everyone has joined.</li>
        </ol>
      </section>

      <section>
        <h2>Round Flow</h2>
        <h3>1. Setup</h3>
        <ul>
          <li>A random player is chosen as the Note Giver for the round (rotates each round).</li>
          <li>The Note Giver draws 3 Note cards.</li>
          <li>Each Writer chooses to draw 3 Plot cards OR 3 Character cards (not both).</li>
        </ul>

        <h3>2. Build Your Movie</h3>
        <ul>
          <li>Each Writer selects 1 card from their hand to play (this is their chosen card).</li>
          <li>Each Writer draws 1 blind card from the <strong>opposite</strong> deck
            (if you drew Plot cards, your blind draw is from Character, and vice versa).</li>
          <li>You won't see your blind card until you start pitching!</li>
          <li>Click "Ready to Pitch" when you're set.</li>
        </ul>

        <h3>3. Pitching</h3>
        <ul>
          <li>Writers pitch one at a time. The Note Giver pitches last.</li>
          <li>Your two cards are revealed — read them aloud and pitch your movie!</li>
          <li>You have <strong>45 seconds</strong> to pitch (the Note Giver controls the timer).</li>
          <li>At any point, the Note Giver can <strong>PAUSE</strong> the timer and play a
            <strong> Note card</strong>. The timer stays paused for 5 seconds so you can read
            the note and gather your thoughts, then auto-resumes.</li>
          <li>You must incorporate the Note into your pitch, no matter how bad it is!</li>
          <li>The pitch ends when the timer hits 0 OR the Note Giver clicks "End Pitch".</li>
          <li>After each pitch, the Note Giver refills their Note hand to 3 cards.</li>
        </ul>

        <h3>4. Vote for the Best Movie</h3>
        <ul>
          <li>After all pitches, voting starts automatically — a <strong>15-second</strong> timer begins.</li>
          <li>Everyone votes: players AND audience. You can't vote for your own movie.</li>
          <li>Each vote is worth 1 point. The player with the most votes this round gets a "Round Winner" banner.</li>
          <li>Voting ends when the timer runs out OR everyone has voted.</li>
          <li>Vote totals are added to each player's cumulative score.</li>
        </ul>
      </section>

      <section>
        <h2>Game End</h2>
        <p>
          The game ends after the chosen number of rounds. The player with the
          most cumulative points wins! Ties are displayed as ties.
        </p>
      </section>

      <section>
        <h2>Writers' Room Variant (Coming Soon)</h2>
        <p>
          In the Writers' Room variant, players pitch TV show seasons instead of movies.
          The winner of each round becomes the Note Giver for the next round, and the winning
          pitch becomes canon — everyone builds on it in subsequent rounds. After 6 seasons,
          players pitch an epic finale movie.
        </p>
      </section>

      <section>
        <h2>Tips</h2>
        <ul>
          <li>Pitch verbally over your Zoom/Teams call — the app handles cards, timer, and scoring.</li>
          <li>The Note Giver can play multiple Notes during a single pitch — each one pauses the timer.</li>
          <li>If the Note deck runs out, the Note Giver draws fewer cards. The game continues.</li>
          <li>You can't vote for yourself — pick the movie you actually liked best!</li>
          <li>Don't overthink it — the best pitches are the ridiculous ones!</li>
        </ul>
      </section>

      <a href="/" className="rules-back-btn">← Back to Join</a>
    </div>
  );
}