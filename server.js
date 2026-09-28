const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const seedData = {
      routes: [
        { id: 'R1', from: 'City Center', to: 'Airport', distance: '18 km', duration: '35 mins' },
        { id: 'R2', from: 'Central Station', to: 'Beach Road', distance: '12 km', duration: '25 mins' },
        { id: 'R3', from: 'Old Town', to: 'University', distance: '10 km', duration: '24 mins' },
        { id: 'R4', from: 'Market Square', to: 'Harbor', distance: '16 km', duration: '32 mins' }
      ],
      trips: [
        {
          id: 'T1001',
          routeId: 'R1',
          date: '2026-09-28',
          departureTime: '08:00',
          arrivalTime: '08:35',
          busName: 'Metro Shuttle 12',
          totalSeats: 18,
          price: 240
        },
        {
          id: 'T1002',
          routeId: 'R2',
          date: '2026-09-28',
          departureTime: '09:30',
          arrivalTime: '09:55',
          busName: 'Coastal Express',
          totalSeats: 16,
          price: 180
        },
        {
          id: 'T1003',
          routeId: 'R3',
          date: '2026-09-28',
          departureTime: '11:15',
          arrivalTime: '11:39',
          busName: 'Campus Link',
          totalSeats: 20,
          price: 150
        },
        {
          id: 'T1004',
          routeId: 'R4',
          date: '2026-09-29',
          departureTime: '07:45',
          arrivalTime: '08:17',
          busName: 'Harbor Runner',
          totalSeats: 14,
          price: 210
        }
      ],
      bookings: [
        {
          id: 'MB-1001',
          tripId: 'T1001',
          customerName: 'Aisha Rahman',
          phone: '0712345678',
          email: 'aisha@example.com',
          seats: [2, 3],
          total: 480,
          status: 'confirmed',
          createdAt: '2026-09-27T08:10:00.000Z'
        },
        {
          id: 'MB-1002',
          tripId: 'T1002',
          customerName: 'Daniel Lewis',
          phone: '0723456789',
          email: 'daniel@example.com',
          seats: [5],
          total: 180,
          status: 'confirmed',
          createdAt: '2026-09-27T09:35:00.000Z'
        }
      ]
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(seedData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function buildRouteLookup(routes) {
  return routes.reduce((lookup, route) => {
    lookup[route.id] = route;
    return lookup;
  }, {});
}

function getBookedSeatsForTrip(tripId, db) {
  return (db.bookings || [])
    .filter((booking) => booking.tripId === tripId)
    .flatMap((booking) => booking.seats || [])
    .filter((seat) => Number.isInteger(seat));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'mini-bus-booking-mvp' });
});

app.get('/api/routes', (req, res) => {
  const db = readData();
  res.json(db.routes);
});

app.get('/api/trips', (req, res) => {
  const db = readData();
  const routeLookup = buildRouteLookup(db.routes);
  const { from, to, date } = req.query;

  let trips = db.trips.map((trip) => {
    const route = routeLookup[trip.routeId];
    const bookedSeats = [...new Set(getBookedSeatsForTrip(trip.id, db))];
    const availableSeats = Math.max(0, trip.totalSeats - bookedSeats.length);

    return {
      ...trip,
      route,
      bookedSeats,
      availableSeats,
      price: Number(trip.price)
    };
  });

  if (from) {
    trips = trips.filter((trip) => trip.route.from.toLowerCase().includes(String(from).toLowerCase()));
  }

  if (to) {
    trips = trips.filter((trip) => trip.route.to.toLowerCase().includes(String(to).toLowerCase()));
  }

  if (date) {
    trips = trips.filter((trip) => trip.date === String(date));
  }

  res.json(trips);
});

app.get('/api/trips/:tripId', (req, res) => {
  const db = readData();
  const routeLookup = buildRouteLookup(db.routes);
  const trip = db.trips.find((item) => item.id === req.params.tripId);

  if (!trip) {
    return res.status(404).json({ message: 'Trip not found' });
  }

  const route = routeLookup[trip.routeId];
  const bookedSeats = [...new Set(getBookedSeatsForTrip(trip.id, db))];

  return res.json({
    ...trip,
    route,
    bookedSeats,
    availableSeats: Math.max(0, trip.totalSeats - bookedSeats.length),
    price: Number(trip.price)
  });
});

app.get('/api/bookings', (req, res) => {
  const db = readData();
  const routeLookup = buildRouteLookup(db.routes);

  const bookings = (db.bookings || []).map((booking) => {
    const trip = db.trips.find((item) => item.id === booking.tripId);
    return {
      ...booking,
      trip,
      route: trip ? routeLookup[trip.routeId] : null
    };
  });

  res.json(bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/bookings', (req, res) => {
  const db = readData();
  const { tripId, customerName, phone, email, seats } = req.body;

  if (!tripId || !customerName || !phone || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ message: 'Please provide trip, customer details, and at least one seat.' });
  }

  const trip = db.trips.find((item) => item.id === tripId);
  if (!trip) {
    return res.status(404).json({ message: 'Trip not found.' });
  }

  const uniqueSeats = [...new Set(seats.map(Number))];
  const bookedSeats = new Set(getBookedSeatsForTrip(tripId, db));
  const invalidSeats = uniqueSeats.filter((seat) => seat < 1 || seat > trip.totalSeats || bookedSeats.has(seat));

  if (invalidSeats.length > 0) {
    return res.status(400).json({
      message: 'One or more selected seats are unavailable.',
      invalidSeats
    });
  }

  const total = trip.price * uniqueSeats.length;
  const booking = {
    id: `MB-${Date.now().toString().slice(-6)}`,
    tripId,
    customerName: customerName.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : '',
    seats: uniqueSeats.sort((a, b) => a - b),
    total,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  db.bookings.push(booking);
  writeData(db);

  return res.status(201).json({ message: 'Booking confirmed successfully.', booking });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

ensureDataFile();

app.listen(PORT, () => {
  console.log(`Mini Bus Booking MVP running at http://localhost:${PORT}`);
});
