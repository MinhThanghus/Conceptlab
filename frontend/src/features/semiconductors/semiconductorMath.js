/** Ideal logic only: steady binary input, ideal complementary switches. */
export function cmosInverter(input) {
  if (input !== 0 && input !== 1) throw new RangeError('CMOS input must be binary')
  return { input, pOn: input === 0, nOn: input === 1, output: 1 - input }
}
