// Everything the site shows lives here. Add a film by adding one entry to `films`.
window.BW = {
  studio: {
    name: 'Banaras Productions',
    tagline: 'Weddings, films & commercials — India & abroad',
    // Placeholder contact details — replace before sharing the site.
    email: 'hello@banarasproductions.com',
    phone: '',
    instagram: '',
    youtube: '',
    heroFilm: 'setarah-max',
    // The homepage film loops this calm golden-hour walk (seconds): it plays hidden for ~5s, then fades in
    // just as the couple walks through the field — the same scene as the homepage photo.
    heroStart: 415,
    heroEnd: 431
  },

  // Studio facts shown in the portfolio sections (as provided by the founder).
  facts: [
    { value: '800+', label: 'Weddings filmed' },
    { value: '28', label: 'Countries' },
    { value: '2012', label: 'Filming since' },
    { value: 'BBC', label: 'Associated with' }
  ],
  workedWith: ['Keeley Wedding Films', 'Mystic Studios', 'Aaron Obed Photography', 'Satyasaji', 'Paradise Visual Media', 'Surya Visual Media'],

  founder: {
    name: 'Retheesh P Raveendran',
    role: 'Founder & lead photographer',
    photo: 'assets/img/founder.jpg',
    photoSmall: 'assets/img/founder-960.jpg'
  },

  categoryLabels: {
    'Wedding': 'Wedding films',
    'Pre-wedding': 'Pre-wedding films',
    'Poetry film': 'Poetry films'
  },

  // `still` picks a clean frame (maxres1–3) when YouTube's thumbnail has text on it;
  // `zoom` crops away letterbox bars baked into that frame; `focus` is the crop's focal point.
  // `embed: false` marks videos whose YouTube owner blocks playback on other sites — they link out instead.
  // `previewStart`/`previewEnd` (seconds) set the stretch a muted preview loops; without an end it plays 30s.
  // `clip: 'media/<name>.mp4'` (optional) plays a short local loop instead of YouTube, which starts instantly.
  films: [
    {
      slug: 'setarah-max',
      youtube: '3qujVWthr1U',
      previewStart: 415,
      previewEnd: 431,
      title: 'Setarah & Max',
      category: 'Wedding',
      place: 'Hedsor House, UK',
      kicker: 'Two families. Two traditions. One summer day.',
      note: 'An elegant, multicultural summer wedding at Hedsor House, cut as a cinematic feature film.',
      channel: 'Keeley Wedding Films'
    },
    {
      slug: 'gokul-athira',
      youtube: 'jtGUEJYPqHk',
      embed: false,
      still: 'maxres3',
      zoom: 1.34,
      title: 'Gokul & Athira',
      category: 'Wedding',
      place: 'Tirupur, Tamil Nadu',
      kicker: 'Two sweethearts, one Tirupur wedding.',
      note: 'The rituals, the families and the small glances in between — a Tamil wedding in Tirupur.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'lodhi-gardens',
      youtube: '5UtQk6DSQsw',
      previewStart: 22,
      previewEnd: 51,
      still: 'maxres3',
      zoom: 1.45,
      focus: '50% 88%',
      title: 'Lodhi Gardens',
      category: 'Pre-wedding',
      place: 'New Delhi',
      kicker: 'Old stone, soft light and the two of them.',
      note: 'A pre-wedding film shot among the lawns and centuries-old tombs of Lodhi Gardens, New Delhi.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'robin-will',
      youtube: 'wfGNWwU1RgU',
      previewStart: 151,
      previewEnd: 176,
      title: 'Robin & Will',
      category: 'Wedding',
      place: 'Cotswolds, UK',
      kicker: 'A Cotswolds church, then Old Gore Barn.',
      note: 'A romantic English church wedding in the Cotswolds, filmed from the vows through to the celebration.',
      channel: 'Keeley Wedding Films'
    },
    {
      slug: 'ashwin-sonali',
      youtube: 'qCJrAyBB2Iw',
      previewStart: 9,
      previewEnd: 37,
      zoom: 1.39,
      title: 'Ashwin & Sonali',
      category: 'Wedding',
      place: '',
      kicker: 'From the Scenario Movies archive.',
      note: 'Cinematic wedding highlights for Ashwin and Sonali, made under Scenario Movies — the studio that grew into Banaras Productions.',
      channel: 'Scenario Movies',
      creditLabel: 'Made by'
    },
    {
      slug: 'vivek-shruthika',
      youtube: 'WERx3LBCDco',
      embed: false,
      title: 'Vivek & Shruthika',
      category: 'Wedding',
      place: '',
      kicker: 'A wedding, told as a love story.',
      note: 'Vivek and Shruthika’s wedding day, from beginning to end.',
      channel: 'weddingtales Prabu'
    },
    {
      slug: 'moms-love',
      youtube: 'FUYzWOqBK6g',
      previewStart: 32,
      previewEnd: 62,
      still: 'maxres1',
      zoom: 1.34,
      title: 'Mom’s Love',
      category: 'Poetry film',
      place: '',
      kicker: 'A film in verse, for a mother.',
      note: 'A short poetry film about a mother’s love.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'sisters-love',
      youtube: 'd3Nqet_iEOE',
      previewStart: 20,
      previewEnd: 50,
      still: 'maxres3',
      zoom: 1.34,
      title: 'Sister’s Love',
      category: 'Poetry film',
      place: '',
      kicker: 'A film in verse, for a sister.',
      note: 'A short poetry film about a sister’s love.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'dads-love',
      youtube: '0_SLUBCPRX4',
      still: 'maxres2',
      previewStart: 63,
      previewEnd: 98,
      zoom: 1.34,
      title: 'A Dad’s Love',
      category: 'Poetry film',
      place: '',
      kicker: 'A film in verse, for a father.',
      note: 'A short poetry film about a father’s love.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'smrithi-prashanth',
      youtube: 'ejvKF9N6ybc',
      embed: false,
      title: 'Smrithi & Prashanth',
      category: 'Wedding',
      place: 'Chennai',
      kicker: 'A Tambrahm wedding in Chennai.',
      note: 'Every ritual of a traditional Tamil Brahmin wedding in Chennai, and the people who made the day.',
      channel: 'Mystic Studios'
    },
    {
      slug: 'siddhant-saloni',
      youtube: 'wSo9hisbjug',
      embed: false,
      still: 'maxres2',
      title: 'Siddhant & Saloni',
      category: 'Wedding',
      place: '',
      kicker: 'Sid’s Cherry Tale.',
      note: 'A wedding teaser for Siddhant and Saloni — “Sid’s Cherry Tale”.',
      channel: 'Aaron Obed Photography'
    },
    {
      slug: 'anchit-shrada',
      youtube: 'HeVCXDOCY_w',
      embed: false,
      still: 'maxres2',
      title: 'Anchit & Shrada',
      category: 'Wedding',
      place: '',
      kicker: 'Wedding highlights.',
      note: 'The highlights of Anchit and Shrada’s wedding — the colour, the family and the dance floor.',
      channel: 'Aaron Obed Photography'
    }
  ]
};
