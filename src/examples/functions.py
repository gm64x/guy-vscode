def calculate_total(items):
    total = 0
    for item in items:
        if item > 0:
            total += item
    return total
    

def main():
    values = [1, 2, 3]
    print(calculate_total(values))
