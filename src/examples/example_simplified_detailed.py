def calculate_total(items, threshold=0):
    total = 0
    count = 0
    valid = True

    for item in items:
        if item > threshold:
            total += item
            count += 1

        if count > 10:
            valid = False
            break

    return total if valid else 0


if __name__ == "__main__":
    data = [1, 5, 3, 8, 2, 10, 4]
    result = calculate_total(data, threshold=2)
    print(f"Result: {result}")
