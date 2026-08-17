package examples

import "fmt"

func process(values []int) (total int) {
	defer func() {
		if recovered := recover(); recovered != nil {
			total = -1
		}
	}()

	if values == nil {
		return -1
	} else if len(values) == 0 {
		return 0
	}

	for index, value := range values {
		if value < 0 {
			continue
		}
		if value == 0 {
			break
		}
		total += value + index
	}

	for total < 100 {
		total++
		if total > 50 {
			break
		}
	}

	switch total {
	case 0:
		return 0
	case 1, 2:
		total += 10
	default:
		total += 20
	}

	select {
	case value := <-make(chan int):
		total += value
	default:
		total++
	}

	goto done

panicPath:
	panic("invalid total")

done:
	if total < 0 {
		goto panicPath
	}
	fmt.Println(total)
	return total
}

func runWorker(values []int, done <-chan struct{}) {
	defer cleanup()
	go process(values)
	for {
		select {
		case <-done:
			return
		default:
			continue
		}
	}
}
