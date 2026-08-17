#include <stddef.h>

static int recover(int value)
{
    if (value < 0) {
        return -1;
    } else if (value == 0) {
        return 0;
    } else {
        return value;
    }
}

int process(const int *values, size_t count)
{
    int total = 0;
    if (values == NULL) {
        return -1;
    }

    for (size_t index = 0; index < count; index++) {
        if (values[index] < 0) {
            continue;
        }
        if (values[index] == 0) {
            break;
        }
        total += values[index];
    }

    while (total < 100) {
        total++;
        if (total > 50) {
            break;
        }
    }

    total += recover(total);
    return total;
}

// Deliberately opaque in the initial CFG model.
int unsupported(int value)
{
    do {
        value--;
    } while (value > 0);

    switch (value) {
    case 0:
        goto done;
    default:
        value = 2;
    }
done:
    return value;
}
