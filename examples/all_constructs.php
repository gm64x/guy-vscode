<?php

namespace Examples;

class AllConstructs
{
    private int $field = 0;

    public function __construct(int $initial)
    {
        $this->field = $initial;
    }

    public function process(array $values): int
    {
        $total = 0;
        if (!$values) {
            return 0;
        } elseif (count($values) === 1) {
            $total = $values[0];
        } else {
            $total = count($values);
        }

        foreach ($values as $value) {
            if ($value < 0) {
                continue;
            }
            if ($value === 0) {
                break;
            }
            $total += $value;
        }

        for ($index = 0; $index < count($values); $index++) {
            $total += $values[$index];
        }

        while ($total < 100) {
            $total++;
            if ($total > 50) {
                break;
            }
        }

        try {
            $total = risky($total);
        } catch (\InvalidArgumentException $error) {
            $total = -2;
        } catch (\Throwable $error) {
            $total = -3;
        } finally {
            $this->field = $total;
        }
        return $total;
    }

    public function risky(int $value): int
    {
        if ($value < 0) {
            throw new \InvalidArgumentException();
        }
        return $value;
    }

    // do/while and match are modeled; yield, goto, and labels trigger warnings.
    public function unsupported(int $value)
    {
        retry:
        do {
            $value--;
        } while ($value > 0);
        if ($value < 0) {
            $value++;
            goto retry;
        }
        yield $value;
        return match ($value) {
            0 => 1,
            default => 2,
        };
    }
}
