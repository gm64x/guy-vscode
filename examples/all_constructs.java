class AllConstructs {
    private int field;

    AllConstructs(int initial) {
        field = initial;
    }

    int process(int[] values) {
        int total = 0;
        if (values == null) {
            return -1;
        } else if (values.length == 0) {
            return 0;
        } else {
            total = values.length;
        }

        for (int value : values) {
            if (value < 0) {
                continue;
            }
            if (value == 0) {
                break;
            }
            total += value;
        }

        for (int index = 0; index < values.length; index++) {
            total += values[index];
        }

        while (total < 100) {
            total++;
            if (total > 50) {
                break;
            }
        }

        try {
            total = risky(total);
        } catch (IllegalArgumentException error) {
            total = -2;
        } catch (RuntimeException error) {
            total = -3;
        } finally {
            field = total;
        }
        return total;
    }

    int risky(int value) {
        if (value < 0) {
            throw new IllegalArgumentException();
        }
        return value;
    }

    // Deliberately opaque in the initial CFG model.
    int unsupported(int value) {
        do {
            value--;
        } while (value > 0);
        switch (value) {
            case 0:
                return 1;
            default:
                return 2;
        }
    }

    int labeled(int value) {
        outer:
        while (value > 0) {
            while (value > 1) {
                break outer;
            }
            value--;
        }
        return value;
    }

    String yieldExample(int value) {
        return switch (value) {
            case 0 -> "zero";
            default -> {
                yield "other";
            }
        };
    }
}
