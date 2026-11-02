export function assignProductSerialNumbers(
  posts: Array<{ id: string; serial_number: number | null }>,
) {
  const usedNumbers = new Set(
    posts.flatMap(({ serial_number }) =>
      Number.isSafeInteger(serial_number) && serial_number !== null && serial_number > 0
        ? [serial_number]
        : [],
    ),
  );
  const serialNumbers = new Map<string, number>();
  let nextNumber = 1;

  for (const post of posts) {
    if (
      Number.isSafeInteger(post.serial_number) &&
      post.serial_number !== null &&
      post.serial_number > 0
    ) {
      serialNumbers.set(post.id, post.serial_number);
      continue;
    }

    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    serialNumbers.set(post.id, nextNumber);
    usedNumbers.add(nextNumber);
    nextNumber += 1;
  }

  return serialNumbers;
}
