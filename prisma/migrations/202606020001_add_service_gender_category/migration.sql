ALTER TABLE "Service" ADD COLUMN "gender" TEXT;
ALTER TABLE "Service" ADD COLUMN "category" TEXT;
DELETE FROM "_BookingToService"
  WHERE "B" IN (SELECT id FROM "Service"
    WHERE name IN (
      'Haircut','Hair Styling','Hair Coloring','Beard Grooming',
      'Hair Treatment','Head Massage','Facial','Shave'
    ));
DELETE FROM "Service"
  WHERE name IN (
    'Haircut','Hair Styling','Hair Coloring','Beard Grooming',
    'Hair Treatment','Head Massage','Facial','Shave'
  );
