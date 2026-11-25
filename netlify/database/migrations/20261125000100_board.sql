CREATE TABLE activities (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  url text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  added_by text,
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE likes (
  activity_id uuid NOT NULL REFERENCES activities(id),
  visitor_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, visitor_id)
);

INSERT INTO activities (id, title, url, category, description, position) VALUES
('10000000-0000-4000-8000-000000000001', 'Architecture River Cruise', 'https://www.architecture.org/city-tours/river-cruise', 'Sightseeing', 'See the skyline from the Chicago River with a guide from the Chicago Architecture Center.', 1),
('10000000-0000-4000-8000-000000000002', 'Art Institute of Chicago', 'https://www.artic.edu/', 'Arts & culture', 'Spend an afternoon with the Impressionists, the Modern Wing, and the museum’s iconic lions.', 2),
('10000000-0000-4000-8000-000000000003', 'Lou Malnati’s Deep Dish', 'https://www.loumalnatis.com/', 'Food & drink', 'Split a Chicago-style deep dish with a buttery crust and chunky tomato sauce.', 3),
('10000000-0000-4000-8000-000000000004', 'Millennium Park', 'https://www.chicago.gov/city/en/depts/dca/supp_info/millennium_park.html', 'Outdoors', 'Meet at the Bean, then explore the gardens and public art in the heart of the Loop.', 4),
('10000000-0000-4000-8000-000000000005', 'Lincoln Park Zoo', 'https://www.lpzoo.org/', 'Outdoors', 'Wander through one of the country’s oldest zoos. Admission is free.', 5),
('10000000-0000-4000-8000-000000000006', 'The Second City', 'https://www.secondcity.com/chicago', 'Arts & culture', 'Catch an improv or sketch comedy show in Old Town.', 6);
