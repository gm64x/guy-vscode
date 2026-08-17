fn process(values: &[i32]) -> Result<i32, &'static str> {
    if values.is_empty() {
        return Ok(0);
    }

    let mut total = 0;
    for value in values {
        if *value < 0 {
            continue;
        }
        if *value == 0 {
            break;
        }
        total += value;
    }

    'outer: loop {
        while total < 100 {
            total += 1;
            if total > 50 {
                break 'outer;
            }
        }
        break;
    }

    match total {
        0 => Ok(0),
        1..=10 => Ok(total + 10),
        _ => Err("total is too large"),
    }
}

fn fallible(value: i32) -> Result<i32, &'static str> {
    let processed = process(&[value])?;
    if processed < 0 {
        return Err("negative result");
    }
    Ok(processed)
}

async fn run_async(value: i32) -> Result<i32, &'static str> {
    let result = fallible(value).await?;
    Ok(result)
}

fn main() {
    let closure = |value: i32| value + 1;
    let value = closure(1);
    if let Ok(result) = process(&[value]) {
        println!("{result}");
    } else {
        panic!("processing failed");
    }
}
