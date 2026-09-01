import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => (
  <main className="container">
    <p className="notice">
      Nothing here. <Link to="/">See all ideas</Link>
    </p>
  </main>
);

export default NotFound;
