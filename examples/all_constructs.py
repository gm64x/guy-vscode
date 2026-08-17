"""Python fixture covering supported flow and intentionally opaque syntax."""


def all_constructs(items, ready=True):
    total = 0

    if not items:
        return 0
    elif len(items) == 1:
        total = items[0]
    else:
        total = len(items)

    for item in items:
        if item < 0:
            continue
        if item == 0:
            break
        total += item
    else:
        total += 1

    while ready:
        total += 1
        if total > 10:
            break
        continue

    try:
        with open("input.txt") as stream:
            total += len(stream.read())
    except OSError:
        total = -1
    else:
        total += 2
    finally:
        ready = False

    for value in items:
        match value:
            case 0:
                total += 1
            case _:
                total += 2
    return total


# Generator suspension remains visible and triggers an unsupported warning.
def unsupported_generator(items):
    for item in items:
        yield item
